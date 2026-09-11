import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

type Html2Canvas = (el: HTMLElement, opts?: Record<string, unknown>) => Promise<HTMLCanvasElement>;

/** Capture a clone of `node` (off-screen, static-positioned) so it renders reliably. */
async function capture(node: HTMLElement, html2canvas: Html2Canvas): Promise<HTMLCanvasElement> {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;background:#ffffff;";
  const clone = node.cloneNode(true) as HTMLElement;
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    return await html2canvas(clone, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    });
  } finally {
    document.body.removeChild(host);
  }
}

/**
 * Render DOM nodes onto A4 pages (one node per page) and return the PDF as
 * base64. jsPDF + html2canvas are loaded on demand.
 */
async function nodesToPdfBase64(nodes: HTMLElement[]): Promise<string> {
  const [{ jsPDF }, html2canvasMod] = await Promise.all([
    import("jspdf"),
    import("html2canvas-pro"),
  ]);
  const html2canvas = html2canvasMod.default as Html2Canvas;

  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;

  for (let i = 0; i < nodes.length; i += 1) {
    const canvas = await capture(nodes[i], html2canvas);

    let w = pageW - margin * 2;
    let h = (canvas.height / canvas.width) * w;
    if (h > pageH - margin * 2) {
      h = pageH - margin * 2;
      w = (canvas.width / canvas.height) * h;
    }

    if (i > 0) doc.addPage();
    doc.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", (pageW - w) / 2, margin, w, h);
  }

  return doc.output("datauristring").split(",")[1];
}

/** Export nodes to a PDF the user saves via a native dialog. Returns false if cancelled. */
export async function savePdf(nodes: HTMLElement[], defaultName: string): Promise<boolean> {
  if (!nodes.length) throw new Error("Nothing to export.");
  const b64 = await nodesToPdfBase64(nodes);
  const dest = await save({
    defaultPath: defaultName.endsWith(".pdf") ? defaultName : `${defaultName}.pdf`,
    filters: [{ name: "PDF document", extensions: ["pdf"] }],
  });
  if (!dest) return false;
  await invoke("save_binary_file", { destPath: dest, dataB64: b64 });
  return true;
}
