import type { PrgDocument, PrgNode } from "../format/types.ts";
import { bytesToBlob } from "../util/blob.ts";
import { nodeLabel } from "./outline-panel.ts";

export interface DetailsActions {
  copyNodeLink(id: string): void;
  openInProjectGraph(): void;
}

const objectUrls = new WeakMap<HTMLElement, string>();

function releasePreview(container: HTMLElement): void {
  const previous = objectUrls.get(container);
  if (previous) {
    URL.revokeObjectURL(previous);
    objectUrls.delete(container);
  }
}

const KIND_LABELS: Record<PrgNode["kind"], string> = {
  text: "文本节点",
  section: "分组框",
  latex: "公式节点",
  image: "图片节点",
  unknown: "未知节点",
};

function field(ownerDocument: Document, term: string, value: string): [HTMLElement, HTMLElement] {
  const dt = ownerDocument.createElement("dt");
  dt.textContent = term;
  const dd = ownerDocument.createElement("dd");
  dd.textContent = value;
  return [dt, dd];
}

export function renderDetails(
  container: HTMLElement,
  document: PrgDocument | null,
  selected: PrgNode[],
  actions: DetailsActions,
): void {
  const ownerDocument = container.ownerDocument;
  releasePreview(container);
  container.replaceChildren();

  if (selected.length === 0) {
    const empty = ownerDocument.createElement("p");
    empty.className = "prg-viewer-muted";
    empty.textContent = "点击画布中的节点查看详情。";
    container.append(empty);
    return;
  }

  if (selected.length > 1) {
    const summary = ownerDocument.createElement("p");
    summary.textContent = `已选择 ${selected.length} 个对象。`;
    container.append(summary);
  }

  const node = selected[0];
  if (!node) return;

  const heading = ownerDocument.createElement("div");
  heading.className = "prg-viewer-badge";
  heading.textContent = KIND_LABELS[node.kind];
  container.append(heading);

  const list = ownerDocument.createElement("dl");
  list.className = "prg-viewer-kv";
  for (const entry of [
    field(ownerDocument, "uuid", node.id),
    field(
      ownerDocument,
      "位置",
      `${Math.round(node.rect.x)}, ${Math.round(node.rect.y)} · ${Math.round(node.rect.width)}×${Math.round(
        node.rect.height,
      )}`,
    ),
  ]) {
    list.append(...entry);
  }
  container.append(list);

  const title = ownerDocument.createElement("p");
  title.className = "prg-viewer-details-text";
  title.textContent = nodeLabel(node);
  container.append(title);

  if (node.kind === "text" && node.details.length > 0) {
    for (const block of node.details) {
      const paragraph = ownerDocument.createElement(block.type.match(/^h[1-6]$/) ? block.type : "p");
      paragraph.className = "prg-viewer-details-text";
      paragraph.textContent = block.text;
      container.append(paragraph);
    }
  }

  if (node.kind === "image") {
    const attachment = document?.attachments.get(node.attachmentId);
    if (attachment && attachment.mime.startsWith("image/")) {
      try {
        const url = URL.createObjectURL(bytesToBlob(attachment.bytes, attachment.mime));
        objectUrls.set(container, url);
        const image = ownerDocument.createElement("img");
        image.className = "prg-viewer-details-image";
        image.src = url;
        image.alt = "节点图片预览";
        container.append(image);
      } catch {
        const failed = ownerDocument.createElement("p");
        failed.className = "prg-viewer-muted";
        failed.textContent = "无法预览附件图片。";
        container.append(failed);
      }
    }
  }

  const actionsRow = ownerDocument.createElement("div");
  actionsRow.className = "prg-viewer-error-actions";

  const copyButton = ownerDocument.createElement("button");
  copyButton.type = "button";
  copyButton.className = "mod-cta";
  copyButton.textContent = "复制节点链接";
  copyButton.addEventListener("click", () => actions.copyNodeLink(node.id));
  actionsRow.append(copyButton);

  const openButton = ownerDocument.createElement("button");
  openButton.type = "button";
  openButton.textContent = "在 Project Graph 中打开";
  openButton.addEventListener("click", () => actions.openInProjectGraph());
  actionsRow.append(openButton);

  container.append(actionsRow);
}
