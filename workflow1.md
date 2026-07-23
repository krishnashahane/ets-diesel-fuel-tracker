Workflow:

User logs in.
User fills 4 dropdown fields.
User captures/uploads 4 required photos.
User clicks Submit.
Backend automatically:
Reads the images using OCR/AI.
Extracts and validates the data.
Saves the record to the database.
Updates the Admin and Super Admin dashboards instantly.
Automatically updates the Excel dataset (or regenerates the Excel export from the database).

Result: The user only uploads photos and submits. Everything else—OCR, validation, data extraction, dashboard updates, and Excel generation—is automated. Admin and Super Admin immediately see the new record without manually entering any data.

Do not use AI/LLMs for business logic. Implement all workflows using robust algorithms, validation rules, database constraints, and rule-based automation. Use OCR only for text extraction, with manual correction if OCR confidence is low.