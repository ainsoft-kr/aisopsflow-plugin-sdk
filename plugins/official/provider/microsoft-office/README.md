# Microsoft Office Plugin

This plugin generates local Excel, Word, and PowerPoint files directly on the Runner host.

It also supports local file CRUD for Office documents inside approved Runner paths.

Capabilities:

- `microsoft.office.read`
- `microsoft.office.write`
- `microsoft.office.delete`
- `office.excel.generate`
- `office.word.generate`
- `office.powerpoint.generate`

This plugin is for local file creation. It does not call Microsoft Graph.

Default writable locations:

- `/tmp`
- `/app/workspace`

Example invoke payloads:

```json
{
  "capability": "office.excel.generate",
  "input": {
    "output_path": "/app/workspace/report.xlsx",
    "sheets": [
      {
        "name": "Summary",
        "rows": [
          ["Metric", "Value"],
          ["Errors", 12],
          ["Warnings", 3]
        ]
      }
    ]
  }
}
```

```json
{
  "capability": "office.word.generate",
  "input": {
    "output_path": "/app/workspace/report.docx",
    "blocks": [
      { "type": "heading", "text": "Incident Summary", "level": 1 },
      { "type": "paragraph", "text": "Service recovered after rollback." },
      { "type": "bullet_list", "items": ["Impact contained", "Follow-up required"] }
    ]
  }
}
```

```json
{
  "capability": "office.powerpoint.generate",
  "input": {
    "output_path": "/app/workspace/report.pptx",
    "slides": [
      {
        "title": "Weekly Review",
        "bullets": ["Revenue up 12%", "New incidents down 30%"]
      }
    ]
  }
}
```
