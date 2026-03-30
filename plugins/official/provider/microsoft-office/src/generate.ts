import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Header,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip
} from 'docx';

const ALLOWED_BASE_DIRS = ['/tmp', '/app/workspace'];
const SUPPORTED_TYPES = {
  excel: '.xlsx',
  word: '.docx',
  powerpoint: '.pptx'
};
const TEMPLATE_ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../templates');
const DOCUMENT_TEMPLATE_DIRS = {
  excel: path.join(TEMPLATE_ROOT_DIR, 'excel'),
  word: path.join(TEMPLATE_ROOT_DIR, 'word'),
  powerpoint: path.join(TEMPLATE_ROOT_DIR, 'presentation')
};
const documentTemplateBundleCache = new Map();

export async function generateExcelFile(input) {
  const outputPath = await prepareOutputPath(input?.output_path, '.xlsx');
  const excelTemplates = await loadDocumentTemplateBundle(input, 'excel');
  const workbook = new ExcelJS.Workbook();
  applyExcelWorkbookMetadata(workbook, excelTemplates);
  const sheets = normalizeSheets(input);
  const defaultColumnWidth = resolveFiniteNumber(excelTemplates?.layouts?.sheet?.defaultColumnWidth);
  const defaultFreezeTopRow = excelTemplates?.layouts?.workbook?.freezeTopRow === true;

  for (const [index, sheetInput] of sheets.entries()) {
    const worksheet = workbook.addWorksheet(resolveSheetName(sheetInput?.name, index));
    const sheetRows = normalizeRows(sheetInput?.rows ?? sheetInput?.rows_json, { preserveTypes: true });
    if (Array.isArray(sheetInput?.columns) && sheetInput.columns.length > 0) {
      worksheet.columns = sheetInput.columns.map((column) => ({
        header: stringifyCell(column?.header),
        key: typeof column?.key === 'string' && column.key.trim() ? column.key.trim() : undefined,
        width: Number.isFinite(Number(column?.width)) ? Number(column.width) : defaultColumnWidth
      }));
    }
    for (const row of sheetRows) {
      worksheet.addRow(row);
    }
    if ((!Array.isArray(sheetInput?.columns) || sheetInput.columns.length === 0) && Number.isFinite(defaultColumnWidth)) {
      for (let columnIndex = 1; columnIndex <= worksheet.columnCount; columnIndex += 1) {
        worksheet.getColumn(columnIndex).width = defaultColumnWidth;
      }
    }
    applyExcelWorksheetTemplate(worksheet, sheetInput, excelTemplates, {
      freezeTopRow:
        sheetInput?.freeze_top_row === true || (sheetInput?.freeze_top_row !== false && defaultFreezeTopRow),
      sheetRows
    });
  }

  await workbook.xlsx.writeFile(outputPath);
  return { ok: true, output_path: outputPath, file_type: 'excel', sheet_count: workbook.worksheets.length };
}

export async function generateWordFile(input) {
  const outputPath = await prepareOutputPath(input?.output_path, '.docx');
  const wordTemplates = await loadDocumentTemplateBundle(input, 'word');
  const blocks = normalizeWordBlocks(input);
  const children = buildWordBlocks(blocks, wordTemplates);
  const doc = new Document({
    sections: [buildWordSection(children, wordTemplates)]
  });
  const buffer = await Packer.toBuffer(doc);
  await fs.writeFile(outputPath, buffer);
  return { ok: true, output_path: outputPath, file_type: 'word', block_count: blocks.length };
}

export async function generatePowerPointFile(input) {
  const outputPath = await prepareOutputPath(input?.output_path, '.pptx');
  const presentationTemplates = await loadDocumentTemplateBundle(input, 'powerpoint');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'AisOpsFlow';
  pptx.company = 'Ainsoft';
  pptx.subject = 'AisOpsFlow generated presentation';
  pptx.title = 'AisOpsFlow Presentation';
  pptx.theme = {
    headFontFace: presentationTemplates.theme.fonts.head,
    bodyFontFace: presentationTemplates.theme.fonts.body
  };
  const slides = normalizeSlides(input);

  for (const [index, slideInput] of slides.entries()) {
    const slide = pptx.addSlide();
    const model = buildPresentationSlideModel(slideInput, index, slides.length, presentationTemplates);
    renderPresentationSlide(slide, model, index, slides.length, presentationTemplates);
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
  return [{ name: 'Sheet1', rows: normalizeRows(input?.rows || input?.rows_json, { preserveTypes: true }) }];
}

function normalizeWordBlocks(input) {
  if (typeof input?.blocks_json === 'string' && input.blocks_json.trim()) {
    try {
      const parsed = JSON.parse(input.blocks_json);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      fail('blocks_json must be valid JSON array', 'invalid_request');
    } catch (_error) {
      fail('blocks_json must be valid JSON array', 'invalid_request');
    }
  }
  if (Array.isArray(input?.blocks)) {
    return input.blocks;
  }
  return [];
}

function normalizeSlides(input) {
  if (typeof input?.slides_json === 'string' && input.slides_json.trim()) {
    try {
      const parsed = JSON.parse(input.slides_json);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
      if (Array.isArray(parsed)) {
        return [{}];
      }
      fail('slides_json must be valid JSON array', 'invalid_request');
    } catch (_error) {
      fail('slides_json must be valid JSON array', 'invalid_request');
    }
  }
  if (Array.isArray(input?.slides) && input.slides.length > 0) {
    return input.slides;
  }
  return [{}];
}

async function loadDocumentTemplateBundle(input = {}, documentType) {
  const inlineBundle = parseInlineDocumentTemplateBundle(input, documentType);
  if (inlineBundle) {
    return inlineBundle;
  }

  const templatePath = normalizeDocumentTemplatePathInput(input, documentType);
  const cacheKey = `${documentType}:${templatePath || '__default__'}`;
  if (!documentTemplateBundleCache.has(cacheKey)) {
    documentTemplateBundleCache.set(cacheKey, loadDocumentTemplateBundleFromSource(documentType, templatePath));
  }
  return documentTemplateBundleCache.get(cacheKey);
}

function normalizeDocumentTemplatePathInput(input, documentType) {
  const candidateFields = resolveDocumentTemplateFields(documentType).path;
  for (const fieldName of candidateFields) {
    if (typeof input?.[fieldName] === 'string' && input[fieldName].trim()) {
      return resolveAllowedPath(input[fieldName].trim(), fieldName);
    }
  }
  return null;
}

function parseInlineDocumentTemplateBundle(input, documentType) {
  const fields = resolveDocumentTemplateFields(documentType);
  for (const fieldName of fields.object) {
    if (input?.[fieldName] && typeof input[fieldName] === 'object') {
      return validateDocumentTemplateBundle(documentType, input[fieldName]);
    }
  }
  for (const fieldName of fields.json) {
    if (typeof input?.[fieldName] === 'string' && input[fieldName].trim()) {
      try {
        return validateDocumentTemplateBundle(documentType, JSON.parse(input[fieldName]));
      } catch (_error) {
        fail(`${fieldName} must be valid JSON object`, 'invalid_request');
      }
    }
  }
  return null;
}

async function loadDocumentTemplateBundleFromSource(documentType, templatePath) {
  const templateKind = documentType === 'powerpoint' ? 'presentation' : documentType;
  if (!templatePath) {
    return loadDocumentTemplateBundleFromDirectory(documentType, DOCUMENT_TEMPLATE_DIRS[documentType]);
  }

  const stat = await fs.stat(templatePath).catch(() => null);
  if (!stat) {
    fail(`${templateKind} template path does not exist`, 'invalid_request');
  }
  if (stat.isDirectory()) {
    return loadDocumentTemplateBundleFromDirectory(documentType, templatePath);
  }
  const raw = await fs.readFile(templatePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    fail(`${templateKind} template file must be valid JSON`, 'invalid_request');
  }
  return validateDocumentTemplateBundle(documentType, parsed);
}

async function loadDocumentTemplateBundleFromDirectory(documentType, templateDir) {
  const [theme, layouts] = await Promise.all([
    readDocumentTemplateFile(templateDir, 'theme.json'),
    readDocumentTemplateFile(templateDir, 'layouts.json')
  ]);
  return validateDocumentTemplateBundle(documentType, { theme, layouts });
}

async function readDocumentTemplateFile(templateDir, fileName) {
  const raw = await fs.readFile(path.join(templateDir, fileName), 'utf8');
  return JSON.parse(raw);
}

function validateDocumentTemplateBundle(documentType, bundle) {
  const templateKind = documentType === 'powerpoint' ? 'presentation' : documentType;
  if (!bundle || typeof bundle !== 'object') {
    fail(`${templateKind} template must be an object`, 'invalid_request');
  }
  if (!bundle.theme || typeof bundle.theme !== 'object') {
    fail(`${templateKind} template must include theme`, 'invalid_request');
  }
  if (!bundle.layouts || typeof bundle.layouts !== 'object') {
    fail(`${templateKind} template must include layouts`, 'invalid_request');
  }
  if (!bundle.theme.fonts || typeof bundle.theme.fonts !== 'object') {
    fail(`${templateKind} template theme must include fonts`, 'invalid_request');
  }
  if (documentType === 'powerpoint') {
    if (!Array.isArray(bundle.theme.palettes) || bundle.theme.palettes.length === 0) {
      fail('presentation template theme must include palettes', 'invalid_request');
    }
  } else if (!bundle.theme.colors || typeof bundle.theme.colors !== 'object') {
    fail(`${templateKind} template theme must include colors`, 'invalid_request');
  }
  return bundle;
}

function resolveDocumentTemplateFields(documentType) {
  if (documentType === 'powerpoint') {
    return {
      path: ['presentation_template_path', 'powerpoint_template_path', 'template_path'],
      object: ['presentation_template', 'powerpoint_template', 'template'],
      json: ['presentation_template_json', 'powerpoint_template_json', 'template_json']
    };
  }
  return {
    path: [`${documentType}_template_path`, 'template_path'],
    object: [`${documentType}_template`, 'template'],
    json: [`${documentType}_template_json`, 'template_json']
  };
}

function buildPresentationSlideModel(slideInput, index, totalSlides, presentationTemplates) {
  const presentationLayouts = presentationTemplates.layouts;
  const title =
    normalizePresentationText(slideInput?.title) ||
    normalizePresentationText(slideInput?.subtitle) ||
    `Slide ${index + 1}`;
  const subtitle =
    normalizePresentationText(slideInput?.subtitle) !== title
      ? normalizePresentationText(slideInput?.subtitle)
      : '';
  const notes = normalizePresentationText(slideInput?.notes);
  const bullets = normalizeBulletItems(slideInput?.bullets);
  const palette = resolvePresentationPalette(index, slideInput?.background_color, presentationTemplates.theme);
  const titleHint = `${title} ${subtitle}`.toLowerCase();
  const timelineIntent = hasTimelineTitleHint(titleHint);
  const metrics = bullets
    .map(parseMetricBullet)
    .filter((item) => item && !isDateLikeLabel(item.label));
  const headlines = bullets.map(parseHeadlineBullet).filter(Boolean);
  const timeline = bullets
    .map((item) => parseTimelineBullet(item, timelineIntent))
    .filter(Boolean);
  const layout = resolvePresentationLayout(
    {
      index,
      bullets,
      metrics,
      headlines,
      timeline
    },
    presentationLayouts
  );

  return {
    title,
    subtitle,
    notes,
    bullets,
    palette,
    layout,
    metrics,
    headlines,
    timeline,
    sectionLabel: resolvePresentationSectionLabel(layout, presentationLayouts),
    totalSlides
  };
}

function resolvePresentationLayout(model, layouts) {
  const presentationPolicy = layouts.presentation || {};
  if (model.index === 0 && layouts.cover?.selection?.firstSlideOnly !== false) {
    return 'cover';
  }

  const bulletCount = model.bullets.length;
  const priority = Array.isArray(presentationPolicy.layoutPriority) && presentationPolicy.layoutPriority.length > 0
    ? presentationPolicy.layoutPriority
    : ['timeline', 'headline', 'metrics', 'spotlight', 'list'];
  const selectionState = {
    timeline:
      bulletCount > 0 &&
      model.timeline.length >= Math.min(layouts.timeline?.selection?.minMatches || 3, bulletCount),
    headline:
      bulletCount > 0 &&
      model.headlines.length >= Math.min(layouts.headline?.selection?.minMatches || 3, bulletCount),
    metrics:
      model.metrics.length >= (layouts.metrics?.selection?.minMatches || 2) &&
      (layouts.metrics?.selection?.requireAllItems !== false ? model.metrics.length === bulletCount : true),
    spotlight: bulletCount <= (layouts.spotlight?.selection?.maxBullets || 4),
    list: true
  };

  for (const candidate of priority) {
    if (selectionState[candidate]) {
      return candidate;
    }
  }
  return presentationPolicy.defaultLayout || 'list';
}

function resolvePresentationSectionLabel(layout, layouts) {
  if (typeof layouts?.[layout]?.sectionLabel === 'string' && layouts[layout].sectionLabel.trim()) {
    return layouts[layout].sectionLabel.trim();
  }
  const suffix =
    typeof layouts?.presentation?.sectionLabelSuffix === 'string' ? layouts.presentation.sectionLabelSuffix : ' VIEW';
  return `${String(layout || 'list').toUpperCase()}${suffix}`;
}

function resolvePresentationPalette(index, backgroundColor, presentationTheme) {
  const palette = presentationTheme.palettes[index % presentationTheme.palettes.length];
  if (typeof backgroundColor === 'string' && backgroundColor.trim()) {
    return { ...palette, bg: backgroundColor.trim() };
  }
  return palette;
}

function renderPresentationSlide(slide, model, index, totalSlides, presentationTemplates) {
  applyPresentationBackdrop(slide, model.palette, index, totalSlides, model.layout, presentationTemplates);

  if (model.layout === 'cover') {
    renderCoverSlide(slide, model, index, totalSlides, presentationTemplates);
  } else {
    renderSlideHeader(slide, model, presentationTemplates);
    if (model.layout === 'metrics') {
      renderMetricSlide(slide, model, presentationTemplates);
    } else if (model.layout === 'headline') {
      renderHeadlineSlide(slide, model, presentationTemplates);
    } else if (model.layout === 'timeline') {
      renderTimelineSlide(slide, model, presentationTemplates);
    } else if (model.layout === 'spotlight') {
      renderSpotlightSlide(slide, model, presentationTemplates);
    } else {
      renderBulletGridSlide(slide, model, presentationTemplates);
    }
  }

  renderSlideFooter(slide, model, presentationTemplates);
}

function applyPresentationBackdrop(slide, palette, index, totalSlides, layout, presentationTemplates) {
  const { backdrop } = presentationTemplates.layouts;
  slide.background = { color: palette.bg };
  renderTemplateElements(slide, backdrop.elements, {
    palette,
    showAccentRail: layout !== 'cover',
    deckLabel: presentationTemplates.theme.deckLabel,
    pageLabel: `${String(index + 1).padStart(2, '0')} / ${String(totalSlides).padStart(2, '0')}`
  });
}

function renderCoverSlide(slide, model, _index, totalSlides, presentationTemplates) {
  const { palette } = model;
  const { cover } = presentationTemplates.layouts;
  const hasNotes = Boolean(model.notes);
  const noteFrame = hasNotes ? cover.notes.frame : null;
  renderTemplateElements(slide, cover.elements, {
    palette,
    title: model.title,
    subtitle: model.subtitle,
    notes: model.notes,
    hasSubtitle: Boolean(model.subtitle),
    hasNotes
  });

  const metaValues = {
    slideCount: String(totalSlides).padStart(2, '0'),
    highlightCount: String(Math.max(model.bullets.length, 1)).padStart(2, '0')
  };
  cover.metaPills.forEach((pill) => {
    renderMetaPill(
      slide,
      palette,
      pill.x,
      pill.y,
      pill.w,
      pill.h,
      pill.label,
      pill.value ?? metaValues[pill.valueKey],
      presentationTemplates
    );
  });

  const highlights = model.bullets.length > 0 ? model.bullets : ['핵심 메시지가 여기 표시됩니다.'];
  const highlightAreaTop = cover.highlights.areaTop;
  const highlightAreaBottom = noteFrame ? noteFrame.y - 0.24 : cover.highlights.areaBottomWithoutNotes;
  const availableHeight = Math.max(0.9, highlightAreaBottom - highlightAreaTop);
  const highlightGap = Math.min(cover.highlights.gapMax, cover.highlights.gapBudget / Math.max(highlights.length, 1));
  const rawHighlightCardHeight = (availableHeight - highlightGap * Math.max(highlights.length - 1, 0)) / Math.max(highlights.length, 1);

  if (rawHighlightCardHeight >= cover.highlights.minCardHeight) {
    const cardHeight = rawHighlightCardHeight;
    highlights.forEach((item, itemIndex) => {
      const y = highlightAreaTop + itemIndex * (cardHeight + highlightGap);
      renderTemplateElements(slide, cover.highlightCardElements, {
        palette,
        item,
        y,
        cardHeight,
        dotY: y + Math.max(0.12, cardHeight / 2 - cover.highlights.dot.size / 2),
        markerColor: itemIndex % 2 === 0 ? palette.accent : palette.accentAlt,
        textHeight: Math.max(cover.highlights.text.minHeight, cardHeight - 0.14),
        textFontSize:
          highlights.length >= (cover.highlights.text.denseItemThreshold || 6)
            ? cover.highlights.text.denseFontSize
            : cover.highlights.text.fontSize
      });
    });
  } else {
    renderTemplateElements(slide, cover.highlightFallbackElements, {
      palette,
      fallbackY: highlightAreaTop,
      fallbackHeight: availableHeight,
      fallbackTextHeight: Math.max(0.4, availableHeight - 0.24),
      fallbackText: highlights.map((item) => `• ${item}`).join('\n')
    });
  }
}

function renderSlideHeader(slide, model, presentationTemplates) {
  const { palette } = model;
  const { header } = presentationTemplates.layouts;
  renderTemplateElements(slide, header.elements, {
    palette,
    sectionLabel: model.sectionLabel,
    title: model.title,
    subtitle: model.subtitle,
    hasSubtitle: Boolean(model.subtitle)
  });
}

function renderMetricSlide(slide, model, presentationTemplates) {
  const { palette } = model;
  const { metrics } = presentationTemplates.layouts;
  const items = model.metrics;
  const grid = computeTwoColumnGridLayout(metrics, items.length);

  items.forEach((item, itemIndex) => {
    const col = itemIndex % 2;
    const row = Math.floor(itemIndex / 2);
    renderTemplateElements(slide, metrics.repeat?.elements, {
      palette,
      item,
      x: metrics.baseX + col * metrics.columnGap,
      y: metrics.baseY + row * (grid.cardHeight + grid.verticalGap),
      cardWidth: metrics.cardW,
      cardHeight: grid.cardHeight,
      accentColor: col === 0 ? palette.accent : palette.accentAlt,
      valueHeight: Math.max(metrics.value.minHeight, grid.cardHeight - 0.62),
      valueFontSize: item.value.length > metrics.value.smallThreshold ? metrics.value.smallFontSize : metrics.value.fontSize
    });
  });
}

function renderHeadlineSlide(slide, model, presentationTemplates) {
  const { palette } = model;
  const { headline } = presentationTemplates.layouts;
  const items = model.headlines;
  const grid = computeTwoColumnGridLayout(headline, items.length);

  items.forEach((item, itemIndex) => {
    const col = itemIndex % 2;
    const row = Math.floor(itemIndex / 2);
    renderTemplateElements(slide, headline.repeat?.elements, {
      palette,
      item,
      x: headline.baseX + col * headline.columnGap,
      y: headline.baseY + row * (grid.cardHeight + grid.verticalGap),
      cardWidth: headline.cardW,
      cardHeight: grid.cardHeight,
      titleHeight: Math.max(headline.title.minHeight, grid.cardHeight - 0.58),
      titleFontSize:
        grid.rows >= (headline.density?.denseRowThreshold || 4) ? headline.title.denseFontSize : headline.title.fontSize
    });
  });
}

function renderTimelineSlide(slide, model, presentationTemplates) {
  const { palette } = model;
  const { timeline } = presentationTemplates.layouts;
  const items = model.timeline;
  const maxAmount = Math.max(...items.map((item) => item.amount || 1), 1);
  const flow = computeVerticalFlowLayout(
    {
      maxCardHeight: timeline.rowHeightMax,
      rowBudget: timeline.rowBudget,
      gapBudget: 0,
      gapMax: 0
    },
    items.length
  );
  const rowHeight = flow.cardHeight;
  const cardHeight = Math.max(timeline.card.minHeight, rowHeight - timeline.card.rowPadding);
  renderTemplateElements(slide, timeline.elements, {
    palette,
    lineHeight: Math.max(timeline.line.minHeight, (items.length - 1) * rowHeight)
  });

  items.forEach((item, itemIndex) => {
    const y = timeline.baseY + itemIndex * rowHeight;
    renderTemplateElements(slide, timeline.repeat?.elements, {
      palette,
      item,
      y,
      cardHeight,
      barY: y + cardHeight - timeline.bar.insetFromBottom,
      barWidth: timeline.bar.minWidth + timeline.bar.scaleWidth * ((item.amount || 1) / maxAmount),
      descriptionHeight: Math.max(timeline.description.minHeight, cardHeight - 0.2),
      descriptionFontSize:
        items.length >= (timeline.description.denseItemThreshold || 6)
          ? timeline.description.denseFontSize
          : timeline.description.fontSize,
      markerColor: itemIndex % 2 === 0 ? palette.accent : palette.accentAlt
    });
  });
}

function renderSpotlightSlide(slide, model, presentationTemplates) {
  const { palette } = model;
  const { spotlight } = presentationTemplates.layouts;
  const [lead, ...rest] = model.bullets;
  renderTemplateElements(slide, spotlight.elements, {
    palette,
    leadText: lead || spotlight.leadText.fallback
  });

  const flow = computeVerticalFlowLayout(
    {
      maxCardHeight: spotlight.sideCards.maxHeight,
      rowBudget: spotlight.sideCards.rowBudget,
      gapMax: spotlight.sideCards.gapMax,
      gapBudget: spotlight.sideCards.gapBudget
    },
    rest.length
  );

  rest.forEach((item, itemIndex) => {
    const y = spotlight.sideCards.y + itemIndex * (flow.cardHeight + flow.verticalGap);
    renderTemplateElements(slide, spotlight.repeat?.elements, {
      palette,
      item,
      y,
      cardHeight: flow.cardHeight,
      textHeight: Math.max(spotlight.sideText.minHeight, flow.cardHeight - 0.18),
      textFontSize:
        rest.length >= (spotlight.sideText.denseItemThreshold || 4)
          ? spotlight.sideText.denseFontSize
          : spotlight.sideText.fontSize,
      surfaceColor: itemIndex % 2 === 0 ? palette.paperAlt : palette.paper
    });
  });
}

function renderBulletGridSlide(slide, model, presentationTemplates) {
  const { palette } = model;
  const { list } = presentationTemplates.layouts;
  const items = model.bullets;
  const grid = computeTwoColumnGridLayout(list, items.length);

  items.forEach((item, itemIndex) => {
    const col = itemIndex % 2;
    const row = Math.floor(itemIndex / 2);
    renderTemplateElements(slide, list.repeat?.elements, {
      palette,
      item,
      x: list.baseX + col * list.columnGap,
      y: list.baseY + row * (grid.cardHeight + grid.verticalGap),
      cardWidth: list.cardW,
      cardHeight: grid.cardHeight,
      bulletColor: row % 2 === 0 ? palette.accent : palette.accentAlt,
      textHeight: Math.max(list.text.minHeight, grid.cardHeight - 0.22),
      textFontSize: grid.rows >= (list.density?.denseRowThreshold || 4) ? list.text.denseFontSize : list.text.fontSize
    });
  });
}

function computeTwoColumnGridLayout(spec, itemCount) {
  const rows = Math.ceil(Math.max(itemCount, 1) / 2);
  return {
    rows,
    ...computeVerticalFlowLayout(spec, rows)
  };
}

function computeVerticalFlowLayout(spec, itemCount) {
  const count = Math.max(itemCount, 1);
  return {
    cardHeight: Math.min(spec.maxCardHeight, spec.rowBudget / count),
    verticalGap: Math.min(spec.gapMax || 0, (spec.gapBudget || 0) / count)
  };
}

function renderTemplateElements(slide, elements, context) {
  if (!Array.isArray(elements) || elements.length === 0) {
    return;
  }
  elements.forEach((element) => renderTemplateElement(slide, element, context));
}

function renderTemplateElement(slide, element, context) {
  const resolved = resolveTemplateNode(element, context);
  if (!resolved || typeof resolved !== 'object') {
    return;
  }
  if (Object.prototype.hasOwnProperty.call(resolved, 'visible') && !resolved.visible) {
    return;
  }
  if (resolved.type === 'shape') {
    const { type, kind, visible, ...options } = resolved;
    slide.addShape(kind, options);
    return;
  }
  if (resolved.type === 'text') {
    const { type, text, visible, ...options } = resolved;
    slide.addText(text, options);
  }
}

function resolveTemplateNode(node, context) {
  if (node === null || node === undefined) {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((item) => resolveTemplateNode(item, context));
  }
  if (typeof node === 'string') {
    return interpolateTemplateString(node, context);
  }
  if (typeof node !== 'object') {
    return node;
  }
  if (Object.prototype.hasOwnProperty.call(node, 'ref')) {
    const value = resolveTemplatePath(context, node.ref);
    if (typeof value === 'number') {
      return value + Number(node.add || 0);
    }
    return value;
  }
  if (Object.prototype.hasOwnProperty.call(node, 'palette')) {
    return context.palette?.[node.palette] || '';
  }
  const resolvedEntries = Object.entries(node).map(([key, value]) => [key, resolveTemplateNode(value, context)]);
  return Object.fromEntries(resolvedEntries);
}

function interpolateTemplateString(template, context) {
  if (!template.includes('{{')) {
    return template;
  }
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, pathExpression) => {
    const value = resolveTemplatePath(context, pathExpression.trim());
    return value === null || value === undefined ? '' : String(value);
  });
}

function resolveTemplatePath(context, pathExpression) {
  return String(pathExpression || '')
    .split('.')
    .filter(Boolean)
    .reduce((acc, segment) => (acc === null || acc === undefined ? undefined : acc[segment]), context);
}

function renderSlideFooter(slide, model, presentationTemplates) {
  if (!model.notes) {
    return;
  }
  const { palette } = model;
  const { footer } = presentationTemplates.layouts;
  renderTemplateElements(slide, footer.elements, {
    palette,
    noteText: `${footer.noteText.prefix}${model.notes}`
  });
}

function renderMetaPill(slide, palette, x, y, w, h, label, value, presentationTemplates) {
  const metaPillTemplate = presentationTemplates?.layouts?.metaPill || {
    labelInsetX: 0.12,
    labelInsetY: 0.11,
    labelHeight: 0.1,
    labelFontSize: 7,
    valueInsetX: 0.12,
    valueInsetY: 0.22,
    valueHeight: 0.16,
    valueFontSize: 10,
    elements: null
  };
  if (!Array.isArray(metaPillTemplate.elements) || metaPillTemplate.elements.length === 0) {
    slide.addShape('roundRect', {
      x,
      y,
      w,
      h,
      fill: { color: palette.paperAlt, transparency: 0 },
      line: { color: palette.paperAlt, transparency: 100 }
    });
    slide.addText(label, {
      x: x + metaPillTemplate.labelInsetX,
      y: y + metaPillTemplate.labelInsetY,
      w: w - metaPillTemplate.labelInsetX * 2,
      h: metaPillTemplate.labelHeight,
      fontSize: metaPillTemplate.labelFontSize,
      color: palette.muted,
      bold: true,
      align: 'center'
    });
    slide.addText(value, {
      x: x + metaPillTemplate.valueInsetX,
      y: y + metaPillTemplate.valueInsetY,
      w: w - metaPillTemplate.valueInsetX * 2,
      h: metaPillTemplate.valueHeight,
      fontSize: metaPillTemplate.valueFontSize,
      color: palette.ink,
      bold: true,
      align: 'center',
      fit: 'shrink'
    });
    return;
  }
  renderTemplateElements(slide, metaPillTemplate.elements, {
    palette,
    x,
    y,
    w,
    h,
    label,
    value,
    labelWidth: w - metaPillTemplate.labelInsetX * 2,
    valueWidth: w - metaPillTemplate.valueInsetX * 2
  });
}

function parseMetricBullet(text) {
  const separatorIndex = String(text || '').indexOf(':');
  if (separatorIndex <= 0) {
    return null;
  }
  const label = text.slice(0, separatorIndex).trim();
  const value = text.slice(separatorIndex + 1).trim();
  if (!label || !value) {
    return null;
  }
  return { label, value };
}

function parseHeadlineBullet(text) {
  const match = String(text || '').match(/^\[(.+?)\]\s+(.+)$/);
  if (!match) {
    return null;
  }
  return { tag: match[1].trim(), title: match[2].trim() };
}

function parseTimelineBullet(text, hasTimelineIntent) {
  const metric = parseMetricBullet(text);
  if (!metric) {
    return null;
  }
  const looksTimeline = isTimelineLabel(metric.label) || (hasTimelineIntent && isSequentialTimelineLabel(metric.label));
  if (!looksTimeline) {
    return null;
  }
  return {
    label: metric.label,
    description: metric.value.replace(/\s+/g, ' ').trim(),
    amount: extractNumericSignal(metric.value)
  };
}

function isDateLikeLabel(label) {
  const value = String(label || '').trim();
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) ||
    /^\d{2}:\d{2}$/.test(value) ||
    /^[A-Za-z]{3,9}\s+\d{1,2}$/.test(value) ||
    /^(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)$/i.test(
      value
    )
  );
}

function hasTimelineTitleHint(titleHint) {
  return /timeline|trend|date|flow|sequence|history|incident|release|rollout|milestone|sprint|추이|일자|타임라인|이력|흐름|릴리스|배포/.test(
    String(titleHint || '')
  );
}

function isTimelineLabel(label) {
  const value = String(label || '').trim();
  return isDateLikeLabel(value) || isSequentialTimelineLabel(value);
}

function isSequentialTimelineLabel(label) {
  const value = String(label || '').trim();
  return (
    /^(day|week|month|quarter|q[1-4]|sprint|phase|step|stage|milestone|release|rollout|incident|build|deploy)\b/i.test(value) ||
    /^\d+\s*(day|week|month|quarter|q[1-4]|주차|일차|단계|분기)$/i.test(value) ||
    /^(주차|일차|단계|분기|릴리스|배포)\s*\d+/i.test(value)
  );
}

function extractNumericSignal(text) {
  const matches = String(text || '').match(/\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) {
    return 0;
  }
  return Number(matches[matches.length - 1]) || 0;
}

function applyExcelWorkbookMetadata(workbook, excelTemplates) {
  const workbookLayout = excelTemplates?.layouts?.workbook || {};
  workbook.creator =
    (typeof workbookLayout.author === 'string' && workbookLayout.author.trim()) ||
    (typeof excelTemplates?.theme?.workbookLabel === 'string' && excelTemplates.theme.workbookLabel.trim()) ||
    'AisOpsFlow';
  workbook.company = workbookLayout.company || 'Ainsoft';
  workbook.subject = workbookLayout.subject || 'AisOpsFlow generated workbook';
  workbook.title = workbookLayout.title || 'AisOpsFlow Workbook';
  workbook.created = new Date();
}

function applyExcelWorksheetTemplate(worksheet, sheetInput, excelTemplates, context) {
  const workbookLayout = excelTemplates?.layouts?.workbook || {};
  const sheetLayout = excelTemplates?.layouts?.sheet || {};
  const headerRowLayout = excelTemplates?.layouts?.headerRow || {};
  const bodyRowLayout = excelTemplates?.layouts?.bodyRow || {};
  const zebraRowLayout = excelTemplates?.layouts?.zebraRow || {};
  const freezeTopRow = context.freezeTopRow === true;
  const showGridLines = sheetLayout.showGridLines !== false;
  worksheet.views = [
    {
      state: freezeTopRow ? 'frozen' : 'normal',
      ySplit: freezeTopRow ? 1 : undefined,
      showGridLines
    }
  ];

  if (sheetLayout.autoFilter === true && worksheet.columnCount > 0 && worksheet.rowCount > 0) {
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: worksheet.columnCount }
    };
  }

  if (resolveFiniteNumber(sheetLayout.defaultRowHeight)) {
    worksheet.properties.defaultRowHeight = Number(sheetLayout.defaultRowHeight);
  }

  if (worksheet.rowCount === 0) {
    return;
  }

  const headerRow = worksheet.getRow(1);
  applyExcelRowStyle(headerRow, buildExcelRowStyle(headerRowLayout, excelTemplates.theme));
  headerRow.commit?.();

  for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    applyExcelRowStyle(row, buildExcelRowStyle(bodyRowLayout, excelTemplates.theme));
    if (sheetLayout.zebra === true && rowIndex % 2 === 0) {
      const zebraStyle = buildExcelRowStyle(zebraRowLayout, excelTemplates.theme);
      if (zebraStyle.fill) {
        row.fill = zebraStyle.fill;
      }
    }
    applyExcelNumberFormats(row, excelTemplates.layouts?.numberFormats || {});
    row.commit?.();
  }
}

function buildExcelRowStyle(spec, theme) {
  if (!spec || typeof spec !== 'object') {
    return {};
  }
  const fontColor = resolveThemeColor(theme, spec.textRef);
  return {
    font: {
      name: spec.fontName || theme?.fonts?.body || 'Aptos',
      size: resolveFiniteNumber(spec.fontSize) || undefined,
      bold: spec.bold === true || undefined,
      italic: spec.italic === true || undefined,
      color: fontColor ? { argb: toExcelArgb(fontColor) } : undefined
    },
    alignment: spec.alignment && typeof spec.alignment === 'object' ? { ...spec.alignment } : undefined,
    fill: buildExcelFill(theme, spec.fillRef),
    border: buildExcelBorder(theme, spec.borderRef, spec.borderStyle),
    numFmt: typeof spec.numFmt === 'string' && spec.numFmt.trim() ? spec.numFmt.trim() : undefined
  };
}

function applyExcelRowStyle(row, style) {
  if (style.font && Object.keys(style.font).length > 0) {
    row.font = style.font;
  }
  if (style.alignment && Object.keys(style.alignment).length > 0) {
    row.alignment = style.alignment;
  }
  if (style.fill) {
    row.fill = style.fill;
  }
  if (style.border) {
    row.border = style.border;
  }
  if (style.numFmt) {
    row.numFmt = style.numFmt;
  }
}

function applyExcelNumberFormats(row, numberFormats) {
  row.eachCell((cell) => {
    if (typeof cell.value !== 'number') {
      return;
    }
    if (Number.isInteger(cell.value) && typeof numberFormats.integer === 'string') {
      cell.numFmt = numberFormats.integer;
      return;
    }
    if (typeof numberFormats.decimal === 'string') {
      cell.numFmt = numberFormats.decimal;
    }
  });
}

function buildExcelFill(theme, fillRef) {
  const color = resolveThemeColor(theme, fillRef);
  if (!color) {
    return undefined;
  }
  return {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: toExcelArgb(color) }
  };
}

function buildExcelBorder(theme, borderRef, borderStyle) {
  const color = resolveThemeColor(theme, borderRef);
  if (!color) {
    return undefined;
  }
  const style = typeof borderStyle === 'string' && borderStyle.trim() ? borderStyle.trim() : 'thin';
  const edge = { style, color: { argb: toExcelArgb(color) } };
  return {
    top: edge,
    left: edge,
    bottom: edge,
    right: edge
  };
}

function normalizeRows(rows, options = {}) {
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
      return row.map((cell) => normalizeRowCell(cell, options));
    }
    if (row && typeof row === 'object') {
      return Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, normalizeRowCell(value, options)])
      );
    }
    return [normalizeRowCell(row, options)];
  });
}

function normalizeRowCell(value, options = {}) {
  if (options.preserveTypes === true) {
    if (
      value === null ||
      value === undefined ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value instanceof Date
    ) {
      return typeof value === 'string' ? collapseWhitespace(value) : value;
    }
  }
  return stringifyCell(value);
}

function buildWordSection(children, wordTemplates) {
  const section = {
    properties: buildWordSectionProperties(wordTemplates),
    children: children.length > 0 ? children : [new Paragraph('')]
  };
  const header = buildWordHeader(wordTemplates);
  const footer = buildWordFooter(wordTemplates);
  if (header) {
    section.headers = { default: header };
  }
  if (footer) {
    section.footers = { default: footer };
  }
  return section;
}

function buildWordSectionProperties(wordTemplates) {
  const page = wordTemplates?.layouts?.document?.page || {};
  return {
    page: {
      margin: {
        top: convertInchesToTwip(resolveFiniteNumber(page.marginTopInches) || 1),
        right: convertInchesToTwip(resolveFiniteNumber(page.marginRightInches) || 0.8),
        bottom: convertInchesToTwip(resolveFiniteNumber(page.marginBottomInches) || 1),
        left: convertInchesToTwip(resolveFiniteNumber(page.marginLeftInches) || 0.8)
      }
    }
  };
}

function buildWordHeader(wordTemplates) {
  const headerLayout = wordTemplates?.layouts?.document?.header || {};
  if (headerLayout.enabled !== true || headerLayout.showDocumentLabel !== true) {
    return null;
  }
  return new Header({
    children: [
      new Paragraph({
        alignment: resolveWordAlignment(headerLayout.alignment),
        spacing: { after: 0, before: 0 },
        children: [
          buildWordTextRun(
            wordTemplates?.theme?.documentLabel || 'AisOpsFlow Report',
            {
              fontSize: resolveFiniteNumber(headerLayout.fontSize) || 9,
              bold: true,
              colorRef: headerLayout.colorRef || 'muted',
              fontName: headerLayout.fontName || wordTemplates?.theme?.fonts?.body
            },
            wordTemplates.theme
          )
        ]
      })
    ]
  });
}

function buildWordFooter(wordTemplates) {
  const footerLayout = wordTemplates?.layouts?.document?.footer || {};
  if (footerLayout.enabled !== true) {
    return null;
  }
  const children = [];
  const prefix = typeof footerLayout.pageNumberPrefix === 'string' ? footerLayout.pageNumberPrefix : 'Page ';
  if (footerLayout.showPageNumber === true) {
    children.push(
      buildWordTextRun(
        prefix,
        {
          fontSize: resolveFiniteNumber(footerLayout.fontSize) || 9,
          colorRef: footerLayout.colorRef || 'muted',
          fontName: footerLayout.fontName || wordTemplates?.theme?.fonts?.body
        },
        wordTemplates.theme
      )
    );
    children.push(PageNumber.CURRENT);
  } else if (typeof footerLayout.text === 'string' && footerLayout.text.trim()) {
    children.push(
      buildWordTextRun(
        footerLayout.text.trim(),
        {
          fontSize: resolveFiniteNumber(footerLayout.fontSize) || 9,
          colorRef: footerLayout.colorRef || 'muted',
          fontName: footerLayout.fontName || wordTemplates?.theme?.fonts?.body
        },
        wordTemplates.theme
      )
    );
  }
  if (children.length === 0) {
    return null;
  }
  return new Footer({
    children: [
      new Paragraph({
        alignment: resolveWordAlignment(footerLayout.alignment),
        spacing: { after: 0, before: 0 },
        children
      })
    ]
  });
}

function buildWordBlocks(blocks, wordTemplates) {
  const children = [];
  for (const block of blocks) {
    const type = typeof block?.type === 'string' ? block.type.trim() : 'paragraph';
    if (type === 'heading') {
      const level = Number.isFinite(Number(block?.level)) ? Number(block.level) : 1;
      children.push(
        buildWordHeadingParagraph(requireText(block?.text, 'word heading text'), level, wordTemplates)
      );
      continue;
    }
    if (type === 'bullet_list' || type === 'numbered_list') {
      const items = Array.isArray(block?.items) ? block.items.filter((item) => String(item || '').trim()) : [];
      for (const [itemIndex, item] of items.entries()) {
        children.push(buildWordListParagraph(String(item).trim(), type, itemIndex, wordTemplates));
      }
      continue;
    }
    if (type === 'table') {
      const rows = Array.isArray(block?.rows) ? block.rows : [];
      children.push(buildWordTable(rows, wordTemplates));
      continue;
    }
    children.push(buildWordParagraph(requireText(block?.text, 'word paragraph text'), 'paragraph', wordTemplates));
  }
  return children;
}

function buildWordHeadingParagraph(text, level, wordTemplates) {
  const headingLayout = wordTemplates?.layouts?.heading?.[`level${level}`] || {};
  return new Paragraph({
    heading: resolveHeadingLevel(level),
    spacing: buildWordSpacing(headingLayout),
    children: [buildWordTextRun(text, headingLayout, wordTemplates.theme)]
  });
}

function buildWordListParagraph(text, listType, itemIndex, wordTemplates) {
  const layoutKey = listType === 'bullet_list' ? 'bulletList' : 'numberedList';
  const listLayout = wordTemplates?.layouts?.[layoutKey] || {};
  const listText = listType === 'numbered_list' ? `${itemIndex + 1}. ${text}` : text;
  const paragraph = new Paragraph({
    bullet: listType === 'bullet_list' ? { level: 0 } : undefined,
    indent: buildWordListIndent(listLayout),
    spacing: buildWordSpacing(listLayout),
    alignment: resolveWordAlignment(listLayout.alignment),
    children: [buildWordTextRun(listText, listLayout, wordTemplates.theme)]
  });
  return paragraph;
}

function buildWordParagraph(text, layoutKey, wordTemplates) {
  const layout = wordTemplates?.layouts?.[layoutKey] || {};
  return new Paragraph({
    spacing: buildWordSpacing(layout),
    alignment: resolveWordAlignment(layout.alignment),
    children: [buildWordTextRun(text, layout, wordTemplates.theme)]
  });
}

function buildWordTable(rows, wordTemplates) {
  const tableLayout = wordTemplates?.layouts?.table || {};
  const headerLayout = tableLayout.header || {};
  const bodyLayout = tableLayout.body || {};
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: buildWordTableBorders(wordTemplates.theme, tableLayout.borderRef || 'line'),
    rows: rows.map((row, rowIndex) =>
      new TableRow({
        tableHeader: rowIndex === 0,
        children: (Array.isArray(row) ? row : [row]).map((cell) =>
          new TableCell({
            shading: rowIndex === 0 ? buildWordShading(wordTemplates.theme, headerLayout.fillRef) : undefined,
            borders: buildWordTableBorders(wordTemplates.theme, tableLayout.borderRef || 'line'),
            margins: buildWordCellMargins(tableLayout.cellMarginTwip),
            children: [
              new Paragraph({
                spacing: buildWordSpacing(rowIndex === 0 ? headerLayout : bodyLayout),
                children: [
                  buildWordTextRun(
                    stringifyCell(cell),
                    rowIndex === 0 ? headerLayout : bodyLayout,
                    wordTemplates.theme
                  )
                ]
              })
            ]
          })
        )
      })
    )
  });
}

function buildWordTextRun(text, style, theme) {
  const color = resolveThemeColor(theme, style?.colorRef);
  const fontSize = resolveFiniteNumber(style?.fontSize);
  return new TextRun({
    text,
    bold: style?.bold === true,
    italics: style?.italic === true,
    color: color || undefined,
    font: style?.fontName || theme?.fonts?.body || 'Aptos',
    size: fontSize ? Math.round(fontSize * 2) : undefined
  });
}

function buildWordSpacing(style) {
  const spacing = {};
  const before = resolveFiniteNumber(style?.spacingBefore);
  const after = resolveFiniteNumber(style?.spacingAfter);
  const line = resolveFiniteNumber(style?.line);
  if (before !== null) {
    spacing.before = pointsToTwip(before);
  }
  if (after !== null) {
    spacing.after = pointsToTwip(after);
  }
  if (line !== null) {
    spacing.line = Math.round(line * 240);
  }
  return spacing;
}

function buildWordListIndent(style) {
  const levelIndentInches = Array.isArray(style?.levelIndentInches) ? style.levelIndentInches : [];
  const left = resolveFiniteNumber(levelIndentInches[0]);
  const hanging = resolveFiniteNumber(style?.hangingInches);
  if (left === null && hanging === null) {
    return undefined;
  }
  return {
    left: convertInchesToTwip(left === null ? 0.5 : left),
    hanging: convertInchesToTwip(hanging === null ? 0.25 : hanging)
  };
}

function buildWordTableBorders(theme, colorRef) {
  const color = resolveThemeColor(theme, colorRef);
  if (!color) {
    return undefined;
  }
  const edge = { style: BorderStyle.SINGLE, size: 4, color };
  return {
    top: edge,
    left: edge,
    bottom: edge,
    right: edge,
    insideHorizontal: edge,
    insideVertical: edge
  };
}

function buildWordCellMargins(cellMarginTwip) {
  const value = resolveFiniteNumber(cellMarginTwip);
  if (value === null) {
    return undefined;
  }
  return {
    top: value,
    bottom: value,
    left: value,
    right: value
  };
}

function buildWordShading(theme, colorRef) {
  const color = resolveThemeColor(theme, colorRef);
  return color ? { fill: color } : undefined;
}

function resolveWordAlignment(value) {
  switch (String(value || '').toLowerCase()) {
    case 'center':
    case 'middle':
      return AlignmentType.CENTER;
    case 'right':
      return AlignmentType.RIGHT;
    case 'justify':
    case 'justified':
      return AlignmentType.JUSTIFIED;
    default:
      return AlignmentType.LEFT;
  }
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
  return stringifyValue(value, { multiline: false });
}

function normalizePresentationText(value, options = {}) {
  return stringifyValue(value, { multiline: options.multiline === true });
}

function normalizeBulletItems(value) {
  const items = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
  return items
    .map((item) => stringifyValue(item, { multiline: false }))
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringifyValue(value, options = {}, depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return options.multiline ? value.trim() : collapseWhitespace(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => stringifyValue(item, options, depth + 1, seen))
      .map((item) => item.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      return '';
    }
    return parts.join(options.multiline ? '\n' : ', ');
  }
  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);

    const pairedText = tryRenderPreferredPair(value, seen);
    if (pairedText) {
      seen.delete(value);
      return pairedText;
    }

    const preferredParts = [
      value.text,
      value.title,
      value.subtitle,
      value.label,
      value.name,
      value.summary,
      value.description,
      value.detail,
      value.message,
      value.content,
      value.value,
      value.note
    ]
      .map((item) => stringifyValue(item, options, depth + 1, seen))
      .map((item) => item.trim())
      .filter(Boolean);

    if (preferredParts.length > 0) {
      seen.delete(value);
      return dedupeStrings(preferredParts).join(options.multiline ? '\n' : ' | ');
    }

    const entries = Object.entries(value)
      .map(([key, item]) => {
        const rendered = stringifyValue(item, options, depth + 1, seen).trim();
        if (!rendered) {
          return '';
        }
        return `${humanizeKey(key)}: ${rendered}`;
      })
      .filter(Boolean);

    if (entries.length > 0) {
      seen.delete(value);
      return entries.join(options.multiline ? '\n' : ' | ');
    }

    if (depth > 3) {
      seen.delete(value);
      return '';
    }

    try {
      const json = JSON.stringify(value);
      seen.delete(value);
      return typeof json === 'string' ? json : '';
    } catch (_error) {
      seen.delete(value);
      return '';
    }
  }
  return String(value);
}

function collapseWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function humanizeKey(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
}

function dedupeStrings(values) {
  return [...new Set(values)];
}

function tryRenderPreferredPair(value, seen) {
  const preferredPairs = [
    ['label', 'value'],
    ['title', 'description'],
    ['title', 'value'],
    ['name', 'message'],
    ['name', 'value'],
    ['summary', 'detail'],
    ['text', 'value']
  ];

  for (const [leftKey, rightKey] of preferredPairs) {
    const left = stringifyValue(value?.[leftKey], { multiline: false }, 1, seen).trim();
    const right = stringifyValue(value?.[rightKey], { multiline: false }, 1, seen).trim();
    if (left && right) {
      return `${left}: ${right}`;
    }
  }

  return '';
}

function resolveThemeColor(theme, colorRef) {
  if (typeof colorRef !== 'string' || !colorRef.trim()) {
    return '';
  }
  const colors = theme?.colors;
  if (!colors || typeof colors !== 'object') {
    return '';
  }
  const value = colors[colorRef.trim()];
  return typeof value === 'string' ? value.trim().replace(/^#/, '').toUpperCase() : '';
}

function toExcelArgb(color) {
  const normalized = String(color || '').trim().replace(/^#/, '').toUpperCase();
  if (normalized.length === 8) {
    return normalized;
  }
  return normalized.length === 6 ? `FF${normalized}` : normalized;
}

function resolveFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function pointsToTwip(points) {
  return Math.round(Number(points || 0) * 20);
}

function fail(message, code = 'runtime_error') {
  const error = new Error(message);
  error.code = code;
  throw error;
}
