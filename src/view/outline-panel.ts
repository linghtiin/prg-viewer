import type { PrgDocument, PrgNode } from "../format/types.ts";

export function nodeLabel(node: PrgNode): string {
  switch (node.kind) {
    case "text":
      return node.text.trim().length > 0 ? node.text.trim() : "(空文本)";
    case "section":
      return node.text.trim().length > 0 ? node.text.trim() : "(未命名分组)";
    case "latex":
      return node.source.trim().length > 0 ? node.source.trim() : "(空公式)";
    case "image":
      return "图片";
    case "unknown":
      return node.typeName;
  }
}

export interface OutlineGroup {
  title: string;
  nodes: PrgNode[];
}

const GROUP_TITLES: Record<PrgNode["kind"], string> = {
  section: "分组",
  text: "文本",
  latex: "公式",
  image: "图片",
  unknown: "其他",
};

export function groupForOutline(document: PrgDocument): OutlineGroup[] {
  const buckets = new Map<PrgNode["kind"], PrgNode[]>();
  for (const id of document.order) {
    const node = document.nodes.get(id);
    if (!node) continue;
    const bucket = buckets.get(node.kind) ?? [];
    bucket.push(node);
    buckets.set(node.kind, bucket);
  }
  const groups: OutlineGroup[] = [];
  for (const kind of ["section", "text", "latex", "image", "unknown"] as const) {
    const nodes = buckets.get(kind);
    if (nodes && nodes.length > 0) groups.push({ title: GROUP_TITLES[kind], nodes });
  }
  return groups;
}

const MAX_LABEL = 42;

function truncate(label: string): string {
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label;
}

/** Semantic (and screen-reader friendly) list of every node in the graph. */
export function renderOutline(
  container: HTMLElement,
  document: PrgDocument,
  selected: ReadonlySet<string>,
  onSelect: (id: string) => void,
): void {
  const ownerDocument = container.ownerDocument;
  container.replaceChildren();

  const groups = groupForOutline(document);
  if (groups.length === 0) {
    const empty = ownerDocument.createElement("p");
    empty.className = "prg-viewer-outline-empty";
    empty.textContent = "没有可显示的节点。";
    container.append(empty);
    return;
  }

  for (const group of groups) {
    const heading = ownerDocument.createElement("h4");
    heading.textContent = `${group.title}（${group.nodes.length}）`;
    container.append(heading);

    for (const node of group.nodes) {
      const button = ownerDocument.createElement("button");
      button.type = "button";
      button.className = "prg-viewer-outline-item";
      button.textContent = truncate(nodeLabel(node));
      button.title = nodeLabel(node);
      if (selected.has(node.id)) button.classList.add("is-selected");
      button.addEventListener("click", () => onSelect(node.id));
      container.append(button);
    }
  }
}
