import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const orange = rgb(1, 0.42, 0.05);
const dark = rgb(0.06, 0.07, 0.08);
const gray = rgb(0.35, 0.37, 0.4);

export type PdfColumn<T> = {
  label: string;
  width: number;
  value: (row: T) => string;
};

function wrapText(text: string, maxChars: number): string[] {
  const words = String(text ?? "").split(/\s+/);
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

export async function buildReportPdf<T>(options: {
  title: string;
  subtitle?: string;
  rows: T[];
  columns: PdfColumn<T>[];
  summary?: string[];
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [842, 595];
  const margin = 36;
  let page = doc.addPage(pageSize);
  let y = 550;

  const drawHeader = () => {
    page.drawRectangle({ x: 0, y: 0, width: pageSize[0], height: pageSize[1], color: rgb(0.98, 0.98, 0.98) });
    page.drawRectangle({ x: 0, y: 530, width: pageSize[0], height: 65, color: dark });
    page.drawText("MKNG", { x: margin, y: 556, size: 25, font: bold, color: orange });
    page.drawText("SOLUÇÕES — SETOR DE COMUNICAÇÃO VISUAL", { x: 125, y: 561, size: 11, font: bold, color: rgb(1, 1, 1) });
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
    page.drawText("Powered by: SER Comunicação Inteligente & Hakham IA", {
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
