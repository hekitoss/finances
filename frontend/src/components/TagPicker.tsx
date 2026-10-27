import { useState } from "react";
import { createTag } from "../api";
import type { NamedDictionaryItem } from "../types";

interface TagPickerProps {
  tags: NamedDictionaryItem[];
  selectedIds: number[];
  onChange: (selectedIds: number[]) => void;
  /** Called after a new tag is saved, so the page can reload its dictionaries. */
  onTagCreated: (tag: NamedDictionaryItem) => Promise<unknown> | void;
  onError: (message: string) => void;
}

/** Toggleable tag chips plus a button to add a new tag; a transaction can have any number of tags. */
export default function TagPicker({ tags, selectedIds, onChange, onTagCreated, onError }: TagPickerProps) {
  const [creating, setCreating] = useState(false);

  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
  };

  async function handleCreate() {
    const name = window.prompt("New tag name:", "");
    if (name === null) {
      return;
    }

    const trimmed = name.trim();
    if (!trimmed) {
      onError("Tag name must not be blank.");
      return;
    }

    setCreating(true);
    try {
      const created = await createTag({ name: trimmed });
      await onTagCreated(created);
      onChange([...selectedIds, created.id]);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to create tag");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="tag-field form-grid-full" role="group" aria-label="Tags">
      <span>Tags</span>
      <div className="tag-picker">
        {tags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            className="tag-chip tag-chip-toggle"
            aria-pressed={selectedIds.includes(tag.id)}
            onClick={() => toggle(tag.id)}
          >
            {tag.name}
          </button>
        ))}
        <button type="button" className="tag-chip tag-chip-add" disabled={creating} onClick={() => void handleCreate()}>
          {creating ? "Adding..." : "+ New tag"}
        </button>
      </div>
    </div>
  );
}
