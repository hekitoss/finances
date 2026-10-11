# REST API

Базовый адрес: `http://<host>:8080`. Формат — JSON. Авторизации нет.

Ошибки возвращаются в виде:

```json
{ "error": "Unknown category id: 42" }
```

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/transactions` | Список транзакций (все или за месяц) |
| `GET` | `/api/transactions/{id}` | Одна транзакция в формате формы (с id справочников) |
| `GET` | `/api/transactions/{id}/items` | Позиции чека |
| `GET` | `/api/transactions/export` | Excel-выгрузка за месяц |
| `POST` | `/api/transactions` | Создать транзакцию |
| `PUT` | `/api/transactions/{id}` | Изменить транзакцию |
| `DELETE` | `/api/transactions/{id}` | Удалить транзакцию (вместе с позициями) |
| `GET` | `/api/dictionaries` | Категории, подкатегории и люди |
| `POST` | `/api/categories` | Создать категорию |
| `POST` | `/api/subcategories` | Создать подкатегорию |

---

## Транзакции

### `GET /api/transactions`

Параметры (необязательные, но только вместе): `month` (1–12), `year`. Без параметров возвращаются все транзакции. Сортировка — по дате и id, новые сверху.

```http
GET /api/transactions?month=10&year=2026
```

```json
[
  {
    "id": 156,
    "transactionDate": "2026-10-10",
    "amount": "-25.89",
    "currency": "EUR",
    "person": "Nikita",
    "category": "Groceries",
    "subCategory": null,
    "comment": "Kaufland",
    "itemsCount": 13
  }
]
```

`itemsCount` — количество позиций чека; `0` для обычных трат. Суммы передаются строками, чтобы не терять точность.

| Код | Когда |
|---|---|
| `200` | Успех |
| `400` | Указан только `month` или только `year`, не числа, месяц вне 1–12 |

### `GET /api/transactions/{id}`

Возвращает транзакцию с id справочников — для формы редактирования.

```json
{
  "id": 156,
  "transactionDate": "2026-10-10",
  "amount": "-25.89",
  "currency": "EUR",
  "personId": 1,
  "categoryId": 13,
  "subcategoryId": null,
  "comment": "Kaufland"
}
```

`404` — транзакция не найдена.

### `GET /api/transactions/{id}/items`

Позиции чека в порядке их следования в чеке. Для транзакции без позиций (или несуществующей) — пустой массив.

```json
[
  {
    "id": 14,
    "position": 1,
    "name": "Вода Volvic Naturelle",
    "amount": "-5.04",
    "category": "Groceries",
    "subCategory": null
  }
]
```

### `GET /api/transactions/export`

Параметры (обязательные): `month`, `year`. Возвращает файл `transactions-YYYY-MM.xlsx` с колонками Date, Amount, Currency, Person, Category, Subcategory, Comment.

```http
GET /api/transactions/export?month=10&year=2026
```

### `POST /api/transactions`

```json
{
  "transactionDate": "2026-10-11",
  "amount": "-12.50",
  "currency": "EUR",
  "personId": 1,
  "categoryId": 2,
  "subcategoryId": 4,
  "comment": "Кофе"
}
```

| Поле | Обязательно | Правила |
|---|---|---|
| `transactionDate` | да | `YYYY-MM-DD` |
| `amount` | да | Строка с числом; расход отрицательный |
| `currency` | нет, `EUR` | Приводится к верхнему регистру |
| `personId` | нет | Должен существовать |
| `categoryId` | да | Должна существовать |
| `subcategoryId` | нет | Должна принадлежать `categoryId` |
| `comment` | нет | Пустая строка сохраняется как `null` |

Ответ `201` — созданная транзакция в формате списка. `400` — ошибка валидации.

### `PUT /api/transactions/{id}`

Тело как у `POST`. Ответ `200` с обновлённой транзакцией, `404` если не найдена. Позиции чека при редактировании не меняются.

### `DELETE /api/transactions/{id}`

Ответ `200` с `true`, если строка удалена, или `false`, если её не было. Позиции чека удаляются каскадно.

---

## Справочники

### `GET /api/dictionaries`

```json
{
  "categories":    [ { "id": 2, "name": "Food" } ],
  "subcategories": [ { "id": 4, "name": "Coffee", "categoryId": 2 } ],
  "persons":       [ { "id": 1, "name": "Nikita" } ]
}
```

### `POST /api/categories`

```json
{ "name": "Pets" }
```

`201` — созданная категория; `400` — пустое имя или такая категория уже есть.

### `POST /api/subcategories`

```json
{ "name": "Vet", "categoryId": 9 }
```

`201` — созданная подкатегория; `400` — пустое имя, дубликат в категории или категории не существует.
