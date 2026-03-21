import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx';

const ALLOWED_BASE_DIRS = ['/tmp', '/app/workspace'];
const SUPPORTED_TYPES = {
  excel: '.xlsx',
  word: '.docx',
  powerpoint: '.pptx'
};

export async function generateExcelFile(input) {
  const outputPath = await prepareOutputPath(input?.output_path, '.xlsx');
  const workbook = new ExcelJS.Workbook();
  const sheets = normalizeSheets(input);

  for (const [index, sheetInput] of sheets.entries()) {
    const worksheet = workbook.addWorksheet(resolveSheetName(sheetInput?.name, index));
    if (Array.isArray(sheetInput?.columns) && sheetInput.columns.length > 0) {
      worksheet.columns = sheetInput.columns.map((column) => ({
        header: stringifyCell(column?.header),
        key: typeof column?.key === 'string' && column.key.trim() ? column.key.trim() : undefined,
        width: Number.isFinite(Number(column?.width)) ? Number(column.width) : undefined
      }));
    }
    for (const row of normalizeRows(sheetInput?.rows)) {
      worksheet.addRow(row);
    }
    if (sheetInput?.freeze_top_row === true) {
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    }
  }

  await workbook.xlsx.writeFile(outputPath);
  return { ok: true, output_path: outputPath, file_type: 'excel', sheet_count: workbook.worksheets.length };
}

export async function generateWordFile(input) {
  const outputPath = await prepareOutputPath(input?.output_path, '.docx');
  const blocks = Array.isArray(input?.blocks) ? input.blocks : [];
  const children = buildWordBlocks(blocks);
  const doc = new Document({
    sections: [{ children: children.length > 0 ? children : [new Paragraph('')] }]
  });
  const buffer = await Packer.toBuffer(doc);
  await fs.writeFile(outputPath, buffer);
  return { ok: true, output_path: outputPath, file_type: 'word', block_count: blocks.length };
}

export async function generatePowerPointFile(input) {
  const outputPath = await prepareOutputPath(input?.output_path, '.pptx');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  const slides = Array.isArray(input?.slides) && input.slides.length > 0 ? input.slides : [{}];

  for (const slideInput of slides) {
    const slide = pptx.addSlide();
    if (typeof slideInput?.background_color === 'string' && slideInput.background_color.trim()) {
      slide.background = { color: slideInput.background_color.trim() };
    }
    if (typeof slideInput?.title === 'string' && slideInput.title.trim()) {
      slide.addText(slideInput.title.trim(), {
        x: 0.5,
        y: 0.3,
        w: 12,
        h: 0.6,
        fontSize: 24,
        bold: true,
        color: '1F2937'
      });
    }
    if (typeof slideInput?.subtitle === 'string' && slideInput.subtitle.trim()) {
      slide.addText(slideInput.subtitle.trim(), {
        x: 0.6,
        y: 1.1,
        w: 11.5,
        h: 0.5,
        fontSize: 14,
        color: '4B5563'
      });
    }
    const bullets = Array.isArray(slideInput?.bullets) ? slideInput.bullets.filter((item) => String(item || '').trim()) : [];
    if (bullets.length > 0) {
      slide.addText(
        bullets.map((item) => ({ text: String(item).trim(), options: { bullet: { indent: 18 } } })),
        {
          x: 0.8,
          y: 1.8,
          w: 11.2,
          h: 4.5,
          fontSize: 18,
          color: '111827',
          breakLine: true,
          paraSpaceAfterPt: 10
        }
      );
    }
    if (typeof slideInput?.notes === 'string' && slideInput.notes.trim()) {
      slide.addText(slideInput.notes.trim(), {
        x: 0.8,
        y: 6.4,
        w: 11,
        h: 0.6,
        fontSize: 10,
        color: '6B7280'
      });
    }
  }

  await pptx.writeFile({ fileName: outputPath });
  return { ok: true, output_path: outputPath, file_type: 'powerpoint', slide_count: slides.length };
}

export async function readOfficeFile(input) {
  const targetPath = resolveExistingOfficePath(input?.path || input?.output_path);
  const stat = await fs.stat(targetPath);
  if (!stat.isFile()) {
    fail('path must point to a file', 'invalid_request');
  }
  const buffer = await fs.readFile(targetPath);
  return {
    ok: true,
    path: targetPath,
    file_type: inferFileTypeFromPath(targetPath),
    size_bytes: stat.size,
    modified_at: stat.mtime.toISOString(),
    content_base64: buffer.toString('base64')
  };
}

export async function writeOfficeFile(input) {
  const mode = typeof input?.mode === 'string' && input.mode.trim() ? input.mode.trim().toLowerCase() : 'create';
  const targetPath = await prepareGenericOutputPath(input);

  if (typeof input?.content_base64 === 'string' && input.content_base64.trim()) {
    const buffer = Buffer.from(input.content_base64.trim(), 'base64');
    await fs.writeFile(targetPath, buffer);
    return {
      ok: true,
      path: targetPath,
      mode,
      file_type: inferFileTypeFromPath(targetPath),
      size_bytes: buffer.length
    };
  }

  const fileType = resolveRequestedFileType(input, targetPath);
  switch (fileType) {
    case 'excel':
      return { ...(await generateExcelFile({ ...input, output_path: targetPath })), mode };
    case 'word':
      return { ...(await generateWordFile({ ...input, output_path: targetPath })), mode };
    case 'powerpoint':
      return { ...(await generatePowerPointFile({ ...input, output_path: targetPath })), mode };
    default:
      fail(`unsupported document_type: ${fileType}`, 'invalid_request');
  }
}

export async function deleteOfficeFile(input) {
  const targetPath = resolveExistingOfficePath(input?.path || input?.output_path);
  await fs.unlink(targetPath);
  return {
    ok: true,
    path: targetPath,
    deleted: true
  };
}

function normalizeSheets(input) {
  if (typeof input?.sheets_json === 'string' && input.sheets_json.trim()) {
    try {
      const parsed = JSON.parse(input.sheets_json);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (_error) {
      fail('sheets_json must be valid JSON array', 'invalid_request');
    }
  }
  if (Array.isArray(input?.sheets) && input.sheets.length > 0) {
    return input.sheets;
  }
  return [{ name: 'Sheet1', rows: normalizeRows(input?.rows || input?.rows_json) }];
}

function normalizeRows(rows) {
  if (typeof rows === 'string' && rows.trim()) {
    try {
      const parsed = JSON.parse(rows);
      if (Array.isArray(parsed)) {
        rows = parsed;
      } else {
        fail('rows_json must be valid JSON array', 'invalid_request');
      }
    } catch (_error) {
      fail('rows_json must be valid JSON array', 'invalid_request');
    }
  }
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((row) => {
    if (Array.isArray(row)) {
      return row.map(stringifyCell);
    }
    if (row && typeof row === 'object') {
      return Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, stringifyCell(value)])
      );
    }
    return [stringifyCell(row)];
  });
}

function buildWordBlocks(blocks) {
  const children = [];
  for (const block of blocks) {
    const type = typeof block?.type === 'string' ? block.type.trim() : 'paragraph';
    if (type === 'heading') {
      const level = Number.isFinite(Number(block?.level)) ? Number(block.level) : 1;
      children.push(
        new Paragraph({
          text: requireText(block?.text, 'word heading text'),
          heading: resolveHeadingLevel(level)
        })
      );
      continue;
    }
    if (type === 'bullet_list' || type === 'numbered_list') {
      const items = Array.isArray(block?.items) ? block.items.filter((item) => String(item || '').trim()) : [];
      for (const [itemIndex, item] of items.entries()) {
        children.push(
          new Paragraph({
            text: type === 'numbered_list' ? `${itemIndex + 1}. ${String(item).trim()}` : String(item).trim(),
            bullet: type === 'bullet_list' ? { level: 0 } : undefined,
          })
        );
      }
      continue;
    }
    if (type === 'table') {
      const rows = Array.isArray(block?.rows) ? block.rows : [];
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: rows.map((row) =>
            new TableRow({
              children: (Array.isArray(row) ? row : [row]).map((cell) =>
                new TableCell({
                  children: [new Paragraph(stringifyCell(cell))]
                })
              )
            })
          )
        })
      );
      continue;
    }
    children.push(
      new Paragraph({
        children: [new TextRun(requireText(block?.text, 'word paragraph text'))]
      })
    );
  }
  return children;
}

function resolveHeadingLevel(level) {
  switch (level) {
    case 1:
      return HeadingLevel.HEADING_1;
    case 2:
      return HeadingLevel.HEADING_2;
    case 3:
      return HeadingLevel.HEADING_3;
    case 4:
      return HeadingLevel.HEADING_4;
    default:
      return HeadingLevel.HEADING_1;
  }
}

function resolveSheetName(name, index) {
  if (typeof name === 'string' && name.trim()) {
    return name.trim().slice(0, 31);
  }
  return `Sheet${index + 1}`;
}

async function prepareOutputPath(outputPath, extension) {
  const raw = requireText(outputPath, 'output_path');
  const normalized = raw.endsWith(extension) ? raw : `${raw}${extension}`;
  const absolute = resolveAllowedPath(normalized, 'output_path');
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  return absolute;
}

async function prepareGenericOutputPath(input) {
  const rawPath = requireText(input?.path || input?.output_path, 'path');
  const requestedType = normalizeDocumentType(input?.document_type);
  const extension = path.extname(rawPath).toLowerCase();
  const resolvedExtension = extension || (requestedType ? SUPPORTED_TYPES[requestedType] : '');
  if (!resolvedExtension) {
    fail('document_type is required when path has no office file extension', 'invalid_request');
  }
  const normalizedPath = extension ? rawPath : `${rawPath}${resolvedExtension}`;
  const absolute = resolveAllowedPath(normalizedPath, 'path');
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  return absolute;
}

function resolveExistingOfficePath(rawPath) {
  const absolute = resolveAllowedPath(rawPath, 'path');
  const fileType = inferFileTypeFromPath(absolute);
  if (!fileType) {
    fail('path must target a supported office file (.xlsx, .docx, .pptx)', 'invalid_request');
  }
  return absolute;
}

function resolveAllowedPath(rawPath, fieldName) {
  const raw = requireText(rawPath, fieldName);
  const absolute = path.resolve(raw);
  if (!ALLOWED_BASE_DIRS.some((baseDir) => absolute === baseDir || absolute.startsWith(`${baseDir}/`))) {
    fail(`${fieldName} must be under ${ALLOWED_BASE_DIRS.join(' or ')}`, 'invalid_request');
  }
  return absolute;
}

function resolveRequestedFileType(input, targetPath) {
  return normalizeDocumentType(input?.document_type) || inferFileTypeFromPath(targetPath);
}

function inferFileTypeFromPath(targetPath) {
  const extension = path.extname(targetPath).toLowerCase();
  return Object.entries(SUPPORTED_TYPES).find(([, value]) => value === extension)?.[0] || null;
}

function normalizeDocumentType(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'ppt' || normalized === 'pptx' || normalized === 'powerpoint') {
    return 'powerpoint';
  }
  if (normalized === 'doc' || normalized === 'docx' || normalized === 'word') {
    return 'word';
  }
  if (normalized === 'xls' || normalized === 'xlsx' || normalized === 'excel') {
    return 'excel';
  }
  return normalized;
}

function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    fail(`${field} is required`, 'invalid_request');
  }
  return value.trim();
}

function stringifyCell(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return value;
}

function fail(message, code = 'runtime_error') {
  const error = new Error(message);
  error.code = code;
  throw error;
}
