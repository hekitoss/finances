import { Navigate, Route, Routes } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import AddTransactionPage from "./pages/AddTransactionPage";
import EditTransactionPage from "./pages/EditTransactionPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/add" element={<AddTransactionPage />} />
      <Route path="/transactions/:id/edit" element={<EditTransactionPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

