import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type RouteContext = {
  params: Promise<{
    sourceId: string;
  }>;
};

type SourceDefinition = {
  title: string;
  pages: string[][];
};

const SOURCES: Record<string, SourceDefinition> = {
  'receipt-revenue-review': {
    title: 'Receipt Revenue Review',
    pages: [
      [
        'March batch close-ready source summary',
        'Northwind receipts $74.25',
        'Contoso receipts $43.75',
        'Verified revenue total 6 receipts reconcile to $146.25 in verified revenue.',
        'Northwind leads the vendor mix Northwind contributed the largest single receipt and leads the vendor total mix.',
      ],
      [
        'March batch source continuation',
        'Fabrikam receipts $18.75',
        'Litware receipts $9.50',
        'Prepare finance handoff Share the verified vendor mix and month total with finance for the weekly close packet.',
        'No duplicate receipt IDs detected No duplicate receipt IDs or mismatched totals were flagged in this batch.',
      ],
    ],
  },
};

async function buildSourcePdf(source: SourceDefinition) {
  const pdf = await PDFDocument.create();
  const titleFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdf.embedFont(StandardFonts.Helvetica);

  for (const [index, lines] of source.pages.entries()) {
    const page = pdf.addPage([612, 792]);
    page.drawRectangle({
      x: 36,
      y: 44,
      width: 540,
      height: 704,
      borderColor: rgb(0.12, 0.14, 0.2),
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });

    page.drawText(source.title, {
      x: 60,
      y: 704,
      size: 24,
      font: titleFont,
      color: rgb(0.1, 0.12, 0.18),
    });

    page.drawText(`Verified source sheet • Page ${index + 1}`, {
      x: 60,
      y: 682,
      size: 11,
      font: bodyFont,
      color: rgb(0.42, 0.44, 0.5),
    });

    let cursorY = 638;
    for (const line of lines) {
      page.drawText(line, {
        x: 60,
        y: cursorY,
        size: 13,
        font: bodyFont,
        color: rgb(0.12, 0.14, 0.2),
        maxWidth: 492,
        lineHeight: 18,
      });
      cursorY -= 96;
    }
  }

  return pdf.save();
}

export async function GET(_: Request, { params }: RouteContext) {
  const { sourceId } = await params;
  const source = SOURCES[sourceId];
  if (!source) {
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }

  const pdfBytes = await buildSourcePdf(source);
  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'Content-Disposition': `inline; filename="${sourceId}.pdf"`,
    },
  });
}
