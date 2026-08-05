import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont } from "pdf-lib";

const orange = rgb(1, 0.42, 0.05);
const dark = rgb(0.06, 0.07, 0.08);
const gray = rgb(0.35, 0.37, 0.4);
const light = rgb(0.98, 0.98, 0.98);

export type PdfBrand = {
  companyName?: string;
  departmentName?: string;
  poweredBy?: string;
  primaryColor?: string;
};

export type PdfColumn<T> = {
  label: string;
  width: number;
  value: (row: T) => string;
};

function colorFromHex(value?: string) {
  const match = String(value ?? "").trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) return orange;
  const n = Number.parseInt(match[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function wrapText(text: string, maxChars: number): string[] {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function brl(value: unknown): string {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateTime(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
}

function dateOnly(value: unknown): string {
  if (!value) return "—";
  const raw = String(value);
  const date = new Date(raw.length === 10 ? `${raw}T12:00:00-03:00` : raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" });
}

function statusLabel(value: string): string {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    approved: "Aprovado",
    production: "Produção",
    finishing: "Acabamento",
    installation: "Instalação",
    completed: "Concluído",
    cancelled: "Cancelado",
    pending: "Pendente",
    active: "Em andamento",
  };
  return labels[value] ?? value ?? "—";
}

export async function buildReportPdf<T>(options: {
  title: string;
  subtitle?: string;
  rows: T[];
  columns: PdfColumn<T>[];
  summary?: string[];
  brand?: PdfBrand;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [842, 595];
  const margin = 36;
  const brandColor = colorFromHex(options.brand?.primaryColor);
  let page = doc.addPage(pageSize);
  let y = 550;

  const drawHeader = () => {
    page.drawRectangle({ x: 0, y: 0, width: pageSize[0], height: pageSize[1], color: light });
    page.drawRectangle({ x: 0, y: 530, width: pageSize[0], height: 65, color: dark });
    page.drawText(options.brand?.companyName || "MKNG", { x: margin, y: 556, size: 22, font: bold, color: brandColor });
    page.drawText((options.brand?.departmentName || "SOLUÇÕES — SETOR DE COMUNICAÇÃO VISUAL").toUpperCase(), { x: 170, y: 561, size: 10, font: bold, color: rgb(1, 1, 1) });
    page.drawText(options.title, { x: margin, y: 510, size: 19, font: bold, color: dark });
    if (options.subtitle) page.drawText(options.subtitle, { x: margin, y: 492, size: 9, font: regular, color: gray });
    page.drawText(`Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })}`, {
      x: 620,
      y: 510,
      size: 8,
      font: regular,
      color: gray,
    });
    y = 468;
  };

  const drawFooter = () => {
    page.drawLine({ start: { x: margin, y: 28 }, end: { x: 806, y: 28 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
    page.drawText(`Powered by: ${options.brand?.poweredBy || "SER Comunicação Inteligente & Hakham IA"}`, {
      x: margin,
      y: 14,
      size: 8,
      font: regular,
      color: gray,
    });
  };

  const nextPage = () => {
    drawFooter();
    page = doc.addPage(pageSize);
    drawHeader();
  };

  drawHeader();

  if (options.summary?.length) {
    for (const item of options.summary) {
      page.drawText(item, { x: margin, y, size: 10, font: bold, color: dark });
      y -= 16;
    }
    y -= 8;
  }

  const totalWidth = options.columns.reduce((sum, column) => sum + column.width, 0);
  const scale = (pageSize[0] - margin * 2) / totalWidth;
  let x = margin;
  page.drawRectangle({ x: margin, y: y - 20, width: pageSize[0] - margin * 2, height: 22, color: rgb(0.12, 0.13, 0.15) });
  for (const column of options.columns) {
    page.drawText(column.label, { x: x + 4, y: y - 13, size: 8, font: bold, color: rgb(1, 1, 1) });
    x += column.width * scale;
  }
  y -= 24;

  for (let index = 0; index < options.rows.length; index += 1) {
    const row = options.rows[index];
    const cellLines = options.columns.map((column) => wrapText(column.value(row), Math.max(8, Math.floor(column.width / 5.5))));
    const rowHeight = Math.max(...cellLines.map((lines) => lines.length)) * 11 + 7;
    if (y - rowHeight < 42) nextPage();
    if (index % 2 === 0) {
      page.drawRectangle({ x: margin, y: y - rowHeight + 3, width: pageSize[0] - margin * 2, height: rowHeight, color: rgb(0.94, 0.94, 0.95) });
    }
    x = margin;
    options.columns.forEach((column, columnIndex) => {
      cellLines[columnIndex].forEach((line, lineIndex) => {
        page.drawText(line, { x: x + 4, y: y - 10 - lineIndex * 11, size: 7.5, font: regular, color: dark });
      });
      x += column.width * scale;
    });
    y -= rowHeight;
  }

  if (!options.rows.length) {
    page.drawText("Nenhum registro encontrado para o período selecionado.", {
      x: margin,
      y: y - 25,
      size: 11,
      font: regular,
      color: gray,
    });
  }

  drawFooter();
  return doc.save();
}

type OrderSnapshot = {
  order?: Record<string, any>;
  items?: any[];
  materials?: any[];
  steps?: any[];
  losses?: any[];
  events?: any[];
};

export async function buildOrderPdf(options: {
  snapshot: OrderSnapshot;
  event?: Record<string, any> | null;
  brand?: PdfBrand;
  includeFinancial?: boolean;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 42;
  const brandColor = colorFromHex(options.brand?.primaryColor);
  const order = options.snapshot.order ?? {};
  const items = Array.isArray(options.snapshot.items) ? options.snapshot.items : [];
  const materials = Array.isArray(options.snapshot.materials) ? options.snapshot.materials : [];
  const steps = Array.isArray(options.snapshot.steps) ? options.snapshot.steps : [];
  const losses = Array.isArray(options.snapshot.losses) ? options.snapshot.losses : [];
  let page = doc.addPage(pageSize);
  let y = 772;

  const drawTextLines = (text: string, x: number, maxChars: number, size = 9, font: PDFFont = regular, color = dark, lineHeight = 13) => {
    const lines = wrapText(text, maxChars);
    for (const line of lines) {
      if (y < 70) nextPage();
      page.drawText(line, { x, y, size, font, color });
      y -= lineHeight;
    }
  };

  const drawFooter = () => {
    page.drawLine({ start: { x: margin, y: 34 }, end: { x: pageSize[0] - margin, y: 34 }, thickness: 0.5, color: rgb(0.78, 0.78, 0.8) });
    page.drawText(`Powered by: ${options.brand?.poweredBy || "SER Comunicação Inteligente & Hakham IA"}`, { x: margin, y: 18, size: 7.5, font: regular, color: gray });
  };

  const drawHeader = () => {
    page.drawRectangle({ x: 0, y: 0, width: pageSize[0], height: pageSize[1], color: light });
    page.drawRectangle({ x: 0, y: 746, width: pageSize[0], height: 96, color: dark });
    page.drawText(options.brand?.companyName || "MKNG SOLUÇÕES", { x: margin, y: 800, size: 20, font: bold, color: brandColor });
    page.drawText((options.brand?.departmentName || "SETOR DE COMUNICAÇÃO VISUAL").toUpperCase(), { x: margin, y: 782, size: 8.5, font: bold, color: rgb(1, 1, 1) });
    const isDraft = order.status === "draft";
    const documentName = order.status === "cancelled" ? "ORDEM DE SERVIÇO CANCELADA" : isDraft ? "PEDIDO PRELIMINAR" : "ORDEM DE SERVIÇO";
    page.drawText(documentName, { x: 340, y: 800, size: 13, font: bold, color: rgb(1, 1, 1) });
    page.drawText(String(order.code || "SEM CÓDIGO"), { x: 340, y: 781, size: 10, font: bold, color: brandColor });
    y = 718;
  };

  const nextPage = () => {
    drawFooter();
    page = doc.addPage(pageSize);
    drawHeader();
  };

  const sectionTitle = (title: string) => {
    if (y < 95) nextPage();
    y -= 6;
    page.drawRectangle({ x: margin, y: y - 17, width: pageSize[0] - margin * 2, height: 23, color: rgb(0.12, 0.13, 0.15) });
    page.drawText(title.toUpperCase(), { x: margin + 8, y: y - 10, size: 9, font: bold, color: rgb(1, 1, 1) });
    y -= 31;
  };

  const keyValue = (label: string, value: string, x: number, widthChars = 33) => {
    page.drawText(label.toUpperCase(), { x, y, size: 7, font: bold, color: gray });
    page.drawText(String(value || "—").slice(0, widthChars), { x, y: y - 14, size: 10, font: bold, color: dark });
  };

  drawHeader();

  if (order.status === "cancelled") {
    page.drawText("CANCELADO", { x: 175, y: 420, size: 64, font: bold, color: rgb(0.9, 0.75, 0.75), rotate: degrees(35), opacity: 0.35 });
  }

  keyValue("Cliente", order.customer_name || order.customerName || "—", margin);
  keyValue("Status", statusLabel(order.status), 310);
  y -= 42;
  keyValue("Entrega", dateOnly(order.due_date), margin);
  keyValue("Prioridade", String(order.priority || "—"), 310);
  y -= 42;
  keyValue("Responsável", order.created_by_name || order.createdByName || "—", margin);
  if (options.includeFinancial) keyValue("Valor", brl(order.total_price), 310);
  y -= 48;

  sectionTitle("Descrição e briefing");
  drawTextLines(order.description || order.title || "Sem descrição.", margin, 90, 9.5);
  if (order.notes) {
    y -= 6;
    page.drawText("OBSERVAÇÕES", { x: margin, y, size: 7, font: bold, color: gray });
    y -= 14;
    drawTextLines(order.notes, margin, 90, 9);
  }

  if (options.event) {
    sectionTitle("Movimentação registrada");
    keyValue("Evento", String(options.event.label || options.event.event_type || "Movimentação"), margin, 55);
    keyValue("Data e hora", dateTime(options.event.created_at), 310, 34);
    y -= 42;
    keyValue("Usuário", options.event.user_name || options.event.created_by_name || "—", margin, 55);
    keyValue("Status", statusLabel(options.event.status || order.status), 310, 34);
    y -= 34;
    if (options.event.notes) drawTextLines(String(options.event.notes), margin, 90, 9);
  }

  sectionTitle("Materiais previstos e consumidos");
  if (!materials.length) {
    drawTextLines("Nenhum material registrado para este pedido.", margin, 90, 9, regular, gray);
  } else {
    const headers = ["Material", "Previsto", "Reservado", "Consumido", "Perda", "Reimp.", "Devolvido"];
    const xs = [margin, 250, 315, 380, 440, 485, 530];
    headers.forEach((header, i) => page.drawText(header, { x: xs[i], y, size: 7, font: bold, color: gray }));
    y -= 15;
    for (const item of materials) {
      if (y < 78) nextPage();
      page.drawText(String(item.material_name || item.name || "Material").slice(0, 38), { x: margin, y, size: 8, font: regular, color: dark });
      page.drawText(`${item.planned_qty ?? 0} ${item.unit ?? ""}`, { x: 250, y, size: 8, font: regular, color: dark });
      page.drawText(`${item.reserved_qty ?? 0}`, { x: 315, y, size: 8, font: regular, color: dark });
      page.drawText(`${item.consumed_qty ?? 0}`, { x: 380, y, size: 8, font: regular, color: dark });
      page.drawText(`${item.loss_qty ?? 0}`, { x: 440, y, size: 8, font: regular, color: rgb(0.72, 0.12, 0.14) });
      page.drawText(`${item.reprint_qty ?? 0}`, { x: 485, y, size: 8, font: regular, color: dark });
      page.drawText(`${item.returned_qty ?? 0}`, { x: 530, y, size: 8, font: regular, color: dark });
      y -= 15;
    }
  }

  if (losses.length) {
    sectionTitle("Perdas e reimpressões");
    for (const loss of losses) {
      if (y < 92) nextPage();
      const status = loss.status === "reversed" ? "ESTORNADA" : "CONFIRMADA";
      page.drawText(`${loss.material_name || "Material"} — ${loss.quantity ?? 0} ${loss.unit ?? ""}`, { x: margin, y, size: 8.5, font: bold, color: loss.status === "reversed" ? gray : rgb(0.72, 0.12, 0.14) });
      page.drawText(status, { x: 475, y, size: 7.5, font: bold, color: loss.status === "reversed" ? gray : rgb(0.72, 0.12, 0.14) });
      y -= 14;
      drawTextLines(`${loss.reason || "Sem motivo informado"}${loss.machine ? ` | Máquina: ${loss.machine}` : ""}${loss.created_by_name ? ` | Operador: ${loss.created_by_name}` : ""}${loss.total_cost ? ` | Custo estimado: ${brl(loss.total_cost)}` : ""}${Number(loss.requires_reprint) === 1 ? ` | Reimpressão: ${loss.reprint_qty ?? 0} ${loss.unit ?? ""}` : ""}`, margin, 88, 8, regular, gray, 11);
      y -= 4;
    }
  }

  if (items.length) {
    sectionTitle("Itens do pedido");
    for (const item of items) {
      if (y < 78) nextPage();
      page.drawText(String(item.description || "Item").slice(0, 65), { x: margin, y, size: 8.5, font: regular, color: dark });
      page.drawText(`${item.quantity ?? 1} un.`, { x: 395, y, size: 8.5, font: regular, color: dark });
      if (options.includeFinancial) page.drawText(brl(item.total_price), { x: 475, y, size: 8.5, font: regular, color: dark });
      y -= 16;
    }
  }

  sectionTitle("Linha de produção");
  if (!steps.length) {
    drawTextLines("Nenhuma etapa registrada.", margin, 90, 9, regular, gray);
  } else {
    for (const step of steps) {
      if (y < 78) nextPage();
      page.drawCircle({ x: margin + 4, y: y + 2, size: 3, color: step.status === "completed" ? rgb(0.18, 0.7, 0.42) : gray });
      page.drawText(`${step.stage || "Etapa"} — ${statusLabel(step.status)}`, { x: margin + 15, y, size: 8.5, font: bold, color: dark });
      page.drawText(step.assignee_name || "Sem responsável", { x: 365, y, size: 8, font: regular, color: gray });
      y -= 16;
    }
  }

  if (order.status === "cancelled" && order.cancellation_reason) {
    sectionTitle("Motivo do cancelamento");
    drawTextLines(order.cancellation_reason, margin, 90, 10, bold, rgb(0.7, 0.1, 0.12));
  }

  y -= 20;
  page.drawLine({ start: { x: margin, y }, end: { x: 255, y }, thickness: 0.7, color: gray });
  page.drawLine({ start: { x: 340, y }, end: { x: pageSize[0] - margin, y }, thickness: 0.7, color: gray });
  page.drawText("Responsável MKNG", { x: margin, y: y - 14, size: 7, font: regular, color: gray });
  page.drawText("Cliente / aprovação", { x: 340, y: y - 14, size: 7, font: regular, color: gray });

  drawFooter();
  return doc.save();
}
