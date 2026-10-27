import { Navigate, Route, Routes } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import AddTransactionPage from "./pages/AddTransactionPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/add" element={<AddTransactionPage />} />
      {/* Transactions are edited inline on the dashboard; old editor links land there. */}
      <Route path="/transactions/:id/edit" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

