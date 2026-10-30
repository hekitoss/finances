import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DateRangePicker, { monthRange } from "../../src/components/DateRangePicker";
import type { DateRange } from "../../src/api";

// Only Date is faked, so user-event's timers still run.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 15, 12));
});

afterEach(() => {
  vi.useRealTimers();
});

function renderPicker(value: DateRange | null = monthRange(2026, 9)) {
  const onChange = vi.fn();
  const user = userEvent.setup();
  const view = render(<DateRangePicker value={value} onChange={onChange} />);
  return { user, onChange, ...view };
}

const popover = () => screen.getByRole("dialog", { name: "Choose period" });
const dayButton = (dayOfMonth: number) =>
  within(popover())
    .getAllByRole("button")
    .find((button) => button.classList.contains("date-range-day") && button.textContent === String(dayOfMonth))!;

describe("DateRangePicker", () => {
  it.each([
    [{ from: "2026-10-01", to: "2026-10-31" }, "1 Oct – 31 Oct 2026"],
    [{ from: "2026-10-07", to: "2026-10-07" }, "7 Oct 2026"],
    [{ from: "2025-12-20", to: "2026-01-10" }, "20 Dec 2025 – 10 Jan 2026"],
    [null, "All time"]
  ])("labels %j as %s", (value, label) => {
    renderPicker(value);
    expect(screen.getByRole("button", { expanded: false })).toHaveTextContent(label);
  });

  it("opens on the month of the range, Monday first, with the range highlighted", async () => {
    const { user } = renderPicker({ from: "2026-10-05", to: "2026-10-09" });
    await user.click(screen.getByRole("button", { name: /Oct/ }));

    expect(within(popover()).getByText("October 2026")).toBeInTheDocument();
    expect(within(popover()).getAllByText(/^(Mo|Tu|We|Th|Fr|Sa|Su)$/).map((cell) => cell.textContent)).toEqual([
      "Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"
    ]);
    // 1 October 2026 is a Thursday: three blank cells before it.
    const grid = popover().querySelector(".date-range-grid")!;
    expect(Array.from(grid.children).slice(7, 11).map((cell) => cell.textContent)).toEqual(["", "", "", "1"]);

    expect(dayButton(5)).toHaveClass("in-range", "range-start", "is-edge");
    expect(dayButton(7)).toHaveClass("in-range");
    expect(dayButton(9)).toHaveClass("range-end");
    expect(dayButton(10)).not.toHaveClass("in-range");
    expect(dayButton(15)).toHaveClass("is-today");
  });

  it("picks a range with two clicks, in either order", async () => {
    const { user, onChange } = renderPicker();
    await user.click(screen.getByRole("button", { name: /Oct/ }));

    await user.click(dayButton(20));
    expect(within(popover()).getByText("Now tap the last day")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    await user.hover(dayButton(12));
    expect(dayButton(15)).toHaveClass("in-range");
    await user.click(dayButton(12));

    expect(onChange).toHaveBeenCalledWith({ from: "2026-10-12", to: "2026-10-20" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("navigates across years with the month arrows", async () => {
    const { user, onChange } = renderPicker({ from: "2026-01-10", to: "2026-01-12" });
    await user.click(screen.getByRole("button", { name: /Jan/ }));

    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(within(popover()).getByText("December 2025")).toBeInTheDocument();
    await user.click(dayButton(30));
    await user.click(screen.getByRole("button", { name: "Next month" }));
    await user.click(dayButton(2));

    expect(onChange).toHaveBeenCalledWith({ from: "2025-12-30", to: "2026-01-02" });
  });

  it.each([
    ["This month", { from: "2026-10-01", to: "2026-10-31" }],
    ["Last month", { from: "2026-09-01", to: "2026-09-30" }],
    ["This year", { from: "2026-01-01", to: "2026-12-31" }],
    ["All time", null]
  ])("applies the %s preset", async (preset, expected) => {
    const { user, onChange } = renderPicker({ from: "2026-10-05", to: "2026-10-06" });
    await user.click(screen.getByRole("button", { name: /Oct/ }));
    await user.click(within(popover()).getByRole("button", { name: preset }));

    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it("marks All time as active and opens on the current month when there is no range", async () => {
    const { user } = renderPicker(null);
    await user.click(screen.getByRole("button", { name: "All time" }));

    expect(within(popover()).getByText("October 2026")).toBeInTheDocument();
    expect(within(popover()).getByRole("button", { name: "All time" })).toHaveClass("is-active");
    expect(popover().querySelectorAll(".in-range")).toHaveLength(0);
  });

  it("closes without a change on Escape or a click outside, and forgets a half-picked range", async () => {
    const { user, onChange } = renderPicker();
    const button = screen.getByRole("button", { name: /Oct/ });

    await user.click(button);
    await user.click(dayButton(3));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(button);
    expect(within(popover()).getByText("Tap the first day")).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("cannot be opened while disabled", async () => {
    const user = userEvent.setup();
    render(<DateRangePicker value={null} onChange={() => {}} disabled />);
    await user.click(screen.getByRole("button", { name: "All time" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
