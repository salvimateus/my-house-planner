import type { ProjectDoc } from '../model/types.ts';
import { PDF_FONTS, pdfFontBase64 } from './fonts.ts';
import { renderSheet } from './sheet.ts';
import { exportFileName } from './svgExport.ts';
import { ExportError, type ExportOptions } from './types.ts';

const LIB_ERROR = 'Não foi possível carregar o gerador de PDF. Confira a internet e tente de novo.';

/**
 * svg2pdf places text through the text matrix but sets the stroke width in the sheet space, so a
 * halo stroke would ignore the scale of its groups. This writes each text stroke in sheet mm.
 */
function textStrokesToSheetSpace(svg: SVGSVGElement): void {
  for (const text of svg.querySelectorAll<SVGTextElement>('text[stroke]')) {
    const sw = Number.parseFloat(text.getAttribute('stroke-width') ?? '1');
    const m = text.getCTM();
    if (!m || !Number.isFinite(sw)) continue;
    const k = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
    text.setAttribute('stroke-width', String(sw * k));
  }
}

/** Vector PDF of the sheet. jsPDF and svg2pdf load only here, on the first PDF export. */
export async function exportPdf(doc: ProjectDoc, opts: ExportOptions): Promise<File> {
  const [libs, fonts] = await Promise.all([
    Promise.all([import('jspdf'), import('svg2pdf.js')]).catch((err: unknown) => {
      throw new ExportError(LIB_ERROR, { cause: err });
    }),
    Promise.all(PDF_FONTS.map((f) => pdfFontBase64(f.file))),
  ]);
  const [{ jsPDF }, { svg2pdf }] = libs;
  const sheet = renderSheet(doc, opts);
  try {
    const { layout } = sheet;
    const pdf = new jsPDF({
      unit: 'mm',
      format: layout.paper === 'A3' ? 'a3' : 'a4',
      orientation: layout.orientation,
      compress: true,
    });
    PDF_FONTS.forEach((f, i) => {
      pdf.addFileToVFS(f.file, fonts[i] ?? '');
      pdf.addFont(f.file, 'Inter', f.style);
    });
    pdf.setFont('Inter', 'normal');
    pdf.setProperties({
      title: doc.name || 'Planta',
      subject: 'Estudo preliminar de planta baixa',
      creator: 'Casinha',
    });
    textStrokesToSheetSpace(sheet.svg);
    await svg2pdf(sheet.svg, pdf, { x: 0, y: 0, width: layout.w, height: layout.h });
    const blob = pdf.output('blob');
    return new File([blob], exportFileName(doc, opts, 'pdf'), { type: 'application/pdf' });
  } catch (err) {
    if (err instanceof ExportError) throw err;
    throw new ExportError('Não foi possível montar o PDF. Tente de novo.', { cause: err });
  } finally {
    sheet.dispose();
  }
}
