import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
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
const PRESENTATION_TEMPLATE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../templates/presentation');
const presentationTemplateBundleCache = new Map();

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
    for (const row of normalizeRows(sheetInput?.rows ?? sheetInput?.rows_json)) {
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
  const blocks = normalizeWordBlocks(input);
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
  const presentationTemplates = await loadPresentationTemplateBundle(input);
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
  return [{ name: 'Sheet1', rows: normalizeRows(input?.rows || input?.rows_json) }];
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

async function loadPresentationTemplateBundle(input = {}) {
  const inlineBundle = parseInlinePresentationTemplateBundle(input);
  if (inlineBundle) {
    return inlineBundle;
  }

  const templatePath = normalizePresentationTemplatePathInput(input);
  const cacheKey = templatePath || '__default__';
  if (!presentationTemplateBundleCache.has(cacheKey)) {
    presentationTemplateBundleCache.set(cacheKey, loadPresentationTemplateBundleFromSource(templatePath));
  }
  return presentationTemplateBundleCache.get(cacheKey);
}

function normalizePresentationTemplatePathInput(input) {
  if (typeof input?.presentation_template_path === 'string' && input.presentation_template_path.trim()) {
    return resolveAllowedPath(input.presentation_template_path.trim(), 'presentation_template_path');
  }
  if (typeof input?.template_path === 'string' && input.template_path.trim()) {
    return resolveAllowedPath(input.template_path.trim(), 'template_path');
  }
  return null;
}

function parseInlinePresentationTemplateBundle(input) {
  if (input?.presentation_template && typeof input.presentation_template === 'object') {
    return validatePresentationTemplateBundle(input.presentation_template);
  }
  if (typeof input?.presentation_template_json === 'string' && input.presentation_template_json.trim()) {
    try {
      return validatePresentationTemplateBundle(JSON.parse(input.presentation_template_json));
    } catch (_error) {
      fail('presentation_template_json must be valid JSON object', 'invalid_request');
    }
  }
  return null;
}

async function loadPresentationTemplateBundleFromSource(templatePath) {
  if (!templatePath) {
    return loadPresentationTemplateBundleFromDirectory(PRESENTATION_TEMPLATE_DIR);
  }

  const stat = await fs.stat(templatePath).catch(() => null);
  if (!stat) {
    fail('presentation template path does not exist', 'invalid_request');
  }
  if (stat.isDirectory()) {
    return loadPresentationTemplateBundleFromDirectory(templatePath);
  }
  const raw = await fs.readFile(templatePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    fail('presentation template file must be valid JSON', 'invalid_request');
  }
  return validatePresentationTemplateBundle(parsed);
}

async function loadPresentationTemplateBundleFromDirectory(templateDir) {
  const [theme, layouts] = await Promise.all([
    readPresentationTemplateFile(templateDir, 'theme.json'),
    readPresentationTemplateFile(templateDir, 'layouts.json')
  ]);
  return validatePresentationTemplateBundle({ theme, layouts });
}

async function readPresentationTemplateFile(templateDir, fileName) {
  const raw = await fs.readFile(path.join(templateDir, fileName), 'utf8');
  return JSON.parse(raw);
}

function validatePresentationTemplateBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') {
    fail('presentation template must be an object', 'invalid_request');
  }
  if (!bundle.theme || typeof bundle.theme !== 'object') {
    fail('presentation template must include theme', 'invalid_request');
  }
  if (!bundle.layouts || typeof bundle.layouts !== 'object') {
    fail('presentation template must include layouts', 'invalid_request');
  }
  if (!Array.isArray(bundle.theme.palettes) || bundle.theme.palettes.length === 0) {
    fail('presentation template theme must include palettes', 'invalid_request');
  }
  if (!bundle.theme.fonts || typeof bundle.theme.fonts !== 'object') {
    fail('presentation template theme must include fonts', 'invalid_request');
  }
  return bundle;
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

function fail(message, code = 'runtime_error') {
  const error = new Error(message);
  error.code = code;
  throw error;
}
