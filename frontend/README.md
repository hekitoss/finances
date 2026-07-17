# Finances Frontend

React + TypeScript + Vite skeleton for showing transactions in a table and a category pie chart.

## Features

- Loads data from `GET /api/transactions`
- Creates transactions via `POST /api/transactions`
- Renders transactions table
- Renders pie chart by category (absolute amount)
- Contains `/add` page with transaction form
- Vite proxy to backend (`http://localhost:8080`)

## Project structure

- `src/App.tsx` - dashboard layout and data loading
- `src/api.ts` - API calls
- `src/types.ts` - transaction type
- `src/components/TransactionsTable.tsx` - table UI
- `src/components/CategoryPieChart.tsx` - pie chart UI
- `src/pages/AddTransactionPage.tsx` - creation form page
- `src/styles.css` - styles

## Run (PowerShell)

```powershell
Set-Location "C:\Users\Никита\Documents\Syncthing\finances\frontend"
npm install
npm run dev
```

Open: `http://localhost:5173`

## Build

```powershell
Set-Location "C:\Users\Никита\Documents\Syncthing\finances\frontend"
npm run build
npm run preview
```

## Backend requirement

Backend must be running and expose:

- `GET /api/transactions`
- `POST /api/transactions`

Sample JSON item:

```json
{
  "id": 1,
  "transactionDate": "2026-07-01",
  "amount": "4200.00",
  "currency": "EUR",
  "person": "Nikita",
  "category": "Income",
  "subCategory": "Salary",
  "comment": "July salary Deutsche Bank"
}
```

