import type { PrgDocument, PrgNode } from "../format/types.ts";
import type { OutlineMode } from "../settings.ts";

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

/** One node in the outline tree, with its immediate children in display order. */
export interface OutlineTreeNode {
  node: PrgNode;
  children: OutlineTreeNode[];
}

/**
 * Builds a forest from the document's two hierarchy sources.
 *
 * Sections carry explicit containment (`children`): a frame owns the entities
 * drawn inside it, and those entries become its children. Files authored as mind
 * maps keep their hierarchy in directed edges, so an edge `from → to` parents
 * `to` under `from` when nothing claimed it yet. A frame takes part in that
 * hierarchy like any other entry: an edge may point at the frame, and a frame
 * whose contents already hang off an edge parent adopts that parent. Without
 * that rule a wrapped node would be re-rooted behind its frame and lose the
 * place it has in the graph. The first declaration wins, and an edge that would
 * close a cycle is ignored, so every node still appears exactly once.
 * Connection-derived siblings are ordered by canvas position so the outline
 * reads like the graph.
 */
export function buildOutlineTree(document: PrgDocument): OutlineTreeNode[] {
  const entries: OutlineTreeNode[] = [];
  const byId = new Map<string, OutlineTreeNode>();
  for (const id of document.order) {
    const node = document.nodes.get(id);
    if (!node || byId.has(id)) continue;
    const entry: OutlineTreeNode = { node, children: [] };
    byId.set(id, entry);
    entries.push(entry);
  }

  const parentOf = new Map<string, OutlineTreeNode>();
  const declaredChildren = new Set<string>();
  const attach = (parent: OutlineTreeNode, childId: string, declared: boolean): void => {
    const child = byId.get(childId);
    if (!child || parentOf.has(childId)) return;
    if (isAncestorOf(parentOf, parent, childId)) return;
    parentOf.set(childId, parent);
    parent.children.push(child);
    if (declared) declaredChildren.add(childId);
  };

  // Containment first: a frame owns the entities drawn inside it.
  for (const entry of entries) {
    if (entry.node.kind !== "section") continue;
    for (const childId of entry.node.children) attach(entry, childId, true);
  }

  // Directed edges organise everything the frames did not claim.
  const edgeParents = new Map<string, string[]>();
  for (const edge of document.edges) {
    if (edge.from === edge.to || !byId.has(edge.from) || !byId.has(edge.to)) continue;
    const parents = edgeParents.get(edge.to);
    if (parents) parents.push(edge.from);
    else edgeParents.set(edge.to, [edge.from]);
  }
  for (const edge of document.edges) {
    if (edge.from === edge.to) continue;
    const parent = byId.get(edge.from);
    const child = byId.get(edge.to);
    if (!parent || !child) continue;
    attach(parent, child.node.id, false);
  }

  // A parentless frame inherits the edge parent of its contents, so a wrapped
  // node keeps its place in the tree and the frame becomes an extra layer.
  for (const entry of entries) {
    if (entry.node.kind !== "section" || parentOf.has(entry.node.id)) continue;
    const anchor = frameAnchor(entry, edgeParents, byId);
    if (anchor) attach(anchor, entry.node.id, false);
  }

  sortInferredChildren(entries, declaredChildren);
  return entries.filter((entry) => !parentOf.has(entry.node.id));
}

/**
 * Finds the edge parent a parentless frame should follow.
 *
 * The frame's contents are searched breadth first in display order, so the frame
 * follows the first contained entry that is attached elsewhere. Parents inside
 * the frame belong to the frame itself and are ignored; this also keeps the
 * attachment acyclic because the chosen parent is outside the frame's subtree.
 */
function frameAnchor(
  frame: OutlineTreeNode,
  edgeParents: ReadonlyMap<string, readonly string[]>,
  byId: ReadonlyMap<string, OutlineTreeNode>,
): OutlineTreeNode | null {
  const inside = new Set<string>([frame.node.id]);
  const collect = [...frame.children];
  while (collect.length > 0) {
    const entry = collect.shift();
    if (!entry) break;
    inside.add(entry.node.id);
    collect.push(...entry.children);
  }

  const visit = [...frame.children];
  while (visit.length > 0) {
    const entry = visit.shift();
    if (!entry) break;
    for (const parentId of edgeParents.get(entry.node.id) ?? []) {
      const parent = byId.get(parentId);
      if (parent && !inside.has(parent.node.id)) return parent;
    }
    visit.push(...entry.children);
  }
  return null;
}

/**
 * Orders children that came from connections by their canvas position (top to
 * bottom, then left to right), so the outline reads like the mind map. Children
 * declared by a section keep their authoring order and stay in front.
 */
function sortInferredChildren(
  entries: readonly OutlineTreeNode[],
  declaredChildren: ReadonlySet<string>,
): void {
  const orderIndex = new Map(entries.map((entry, index) => [entry.node.id, index]));
  const byPosition = (a: OutlineTreeNode, b: OutlineTreeNode): number =>
    a.node.rect.y - b.node.rect.y ||
    a.node.rect.x - b.node.rect.x ||
    (orderIndex.get(a.node.id) ?? 0) - (orderIndex.get(b.node.id) ?? 0);

  for (const entry of entries) {
    if (entry.children.length < 2) continue;
    const declared = entry.children.filter((child) => declaredChildren.has(child.node.id));
    const inferred = entry.children.filter((child) => !declaredChildren.has(child.node.id));
    if (inferred.length === 0) continue;
    inferred.sort(byPosition);
    entry.children = declared.length > 0 ? [...declared, ...inferred] : inferred;
  }
}

/** True when `candidateId` is `entry` itself or one of its ancestors. */
function isAncestorOf(
  parentOf: ReadonlyMap<string, OutlineTreeNode>,
  entry: OutlineTreeNode,
  candidateId: string,
): boolean {
  let current: OutlineTreeNode | undefined = entry;
  while (current) {
    if (current.node.id === candidateId) return true;
    current = parentOf.get(current.node.id);
  }
  return false;
}

/** Ids of the ancestors of `id`, outermost first; empty when it is a root or unknown. */
export function outlineAncestors(document: PrgDocument, id: string): string[] {
  const path: string[] = [];
  const visit = (entries: readonly OutlineTreeNode[]): boolean => {
    for (const entry of entries) {
      if (entry.node.id === id) return true;
      path.push(entry.node.id);
      if (visit(entry.children)) return true;
      path.pop();
    }
    return false;
  };
  return visit(buildOutlineTree(document)) ? path : [];
}

/** Ids of the nodes that own at least one child in the outline tree. */
export function collapsibleOutlineIds(document: PrgDocument): string[] {
  const ids: string[] = [];
  const visit = (entries: readonly OutlineTreeNode[]): void => {
    for (const entry of entries) {
      if (entry.children.length > 0) ids.push(entry.node.id);
      visit(entry.children);
    }
  };
  visit(buildOutlineTree(document));
  return ids;
}

export type NavigationDirection = "up" | "down" | "left" | "right";

/** One row currently visible in the outline. */
export interface OutlineRow {
  id: string;
  parentId: string | null;
  hasChildren: boolean;
}

/**
 * Flattens the outline in display order. When `collapsed` is given, children of
 * those nodes are skipped, matching what the sidebar actually shows.
 */
export function flattenOutline(document: PrgDocument, collapsed?: ReadonlySet<string>): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const visit = (entries: readonly OutlineTreeNode[], parentId: string | null): void => {
    for (const entry of entries) {
      const id = entry.node.id;
      rows.push({ id, parentId, hasChildren: entry.children.length > 0 });
      if (entry.children.length > 0 && !collapsed?.has(id)) visit(entry.children, id);
    }
  };
  visit(buildOutlineTree(document), null);
  return rows;
}

export interface OutlineNavigation {
  kind: "select" | "collapse" | "expand";
  id: string;
}

const NO_COLLAPSE: { allowCollapse: boolean; collapsed: ReadonlySet<string> } = {
  allowCollapse: false,
  collapsed: new Set<string>(),
};

/**
 * Resolves one arrow-key step in the outline.
 *
 * Up/down walk the visible rows; left/right go to the parent or first child.
 * In tree mode, left/right first collapse or expand the current branch, which
 * is the usual behaviour of nested trees. Category mode passes rows without
 * parents, so only up/down do anything there.
 */
export function resolveOutlineNavigation(
  rows: readonly OutlineRow[],
  currentId: string | null,
  direction: NavigationDirection,
  options: { allowCollapse: boolean; collapsed: ReadonlySet<string> } = NO_COLLAPSE,
): OutlineNavigation | null {
  const index = currentId ? rows.findIndex((row) => row.id === currentId) : -1;
  if (index < 0) {
    const first = rows[0];
    return first ? { kind: "select", id: first.id } : null;
  }
  const current = rows[index];
  if (!current) return null;

  if (direction === "left") {
    if (options.allowCollapse && current.hasChildren && !options.collapsed.has(current.id)) {
      return { kind: "collapse", id: current.id };
    }
    return current.parentId ? { kind: "select", id: current.parentId } : null;
  }

  if (direction === "right") {
    if (!current.hasChildren) return null;
    if (options.allowCollapse && options.collapsed.has(current.id)) {
      return { kind: "expand", id: current.id };
    }
    const next = rows[index + 1];
    return next && next.parentId === current.id ? { kind: "select", id: next.id } : null;
  }

  const next = rows[direction === "down" ? index + 1 : index - 1];
  return next ? { kind: "select", id: next.id } : null;
}

export interface OutlineRenderState {
  mode: OutlineMode;
  selected: ReadonlySet<string>;
  collapsed: ReadonlySet<string>;
}

export interface OutlineActions {
  select(id: string): void;
  toggleCollapse(id: string): void;
  expandAll(): void;
  collapseAll(): void;
}

const MAX_LABEL = 42;

function truncate(label: string): string {
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label;
}

function outlineItem(
  ownerDocument: Document,
  node: PrgNode,
  selected: ReadonlySet<string>,
  select: (id: string) => void,
): HTMLButtonElement {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.className = "prg-viewer-outline-item";
  button.dataset.outlineId = node.id;
  button.dataset.outlineRole = "item";
  button.dataset.outlineKind = node.kind;
  const label = nodeLabel(node);
  const isFrame = node.kind === "section";
  if (isFrame) {
    button.classList.add("is-frame");
    button.setAttribute("aria-label", `分组框：${label}`);
  }

  const marker = ownerDocument.createElement("span");
  marker.className = "prg-viewer-outline-kind";
  marker.textContent = isFrame ? "▣" : "•";
  marker.setAttribute("aria-hidden", "true");
  const text = ownerDocument.createElement("span");
  text.className = "prg-viewer-outline-label";
  text.textContent = truncate(label);
  button.append(marker, text);

  button.title = label;
  if (selected.has(node.id)) button.classList.add("is-selected");
  button.addEventListener("click", () => select(node.id));
  return button;
}

function appendEmpty(ownerDocument: Document, container: HTMLElement): void {
  const empty = ownerDocument.createElement("p");
  empty.className = "prg-viewer-outline-empty";
  empty.textContent = "没有可显示的节点。";
  container.append(empty);
}

function toolButton(ownerDocument: Document, label: string, onClick: () => void): HTMLButtonElement {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.className = "prg-viewer-outline-tool";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderCategoryOutline(
  container: HTMLElement,
  document: PrgDocument,
  selected: ReadonlySet<string>,
  select: (id: string) => void,
): void {
  const ownerDocument = container.ownerDocument;
  const groups = groupForOutline(document);
  if (groups.length === 0) {
    appendEmpty(ownerDocument, container);
    return;
  }

  for (const group of groups) {
    const heading = ownerDocument.createElement("h4");
    heading.textContent = `${group.title}（${group.nodes.length}）`;
    container.append(heading);

    for (const node of group.nodes) {
      container.append(outlineItem(ownerDocument, node, selected, select));
    }
  }
}

function renderTreeOutline(
  container: HTMLElement,
  document: PrgDocument,
  state: OutlineRenderState,
  actions: OutlineActions,
): void {
  const ownerDocument = container.ownerDocument;
  const tree = buildOutlineTree(document);
  if (tree.length === 0) {
    appendEmpty(ownerDocument, container);
    return;
  }

  const tools = ownerDocument.createElement("div");
  tools.className = "prg-viewer-outline-tools";
  tools.append(
    toolButton(ownerDocument, "全部折叠", () => actions.collapseAll()),
    toolButton(ownerDocument, "全部展开", () => actions.expandAll()),
  );
  container.append(tools);

  const list = ownerDocument.createElement("ul");
  list.className = "prg-viewer-outline-tree";
  appendTreeEntries(ownerDocument, list, tree, state, actions);
  container.append(list);
}

function appendTreeEntries(
  ownerDocument: Document,
  list: HTMLUListElement,
  entries: readonly OutlineTreeNode[],
  state: OutlineRenderState,
  actions: OutlineActions,
): void {
  for (const entry of entries) {
    const item = ownerDocument.createElement("li");
    item.className = "prg-viewer-outline-node";

    const row = ownerDocument.createElement("div");
    row.className = "prg-viewer-outline-row";

    const hasChildren = entry.children.length > 0;
    const expanded = hasChildren && !state.collapsed.has(entry.node.id);
    if (hasChildren) {
      const toggle = ownerDocument.createElement("button");
      toggle.type = "button";
      toggle.className = "prg-viewer-outline-toggle";
      toggle.dataset.outlineId = entry.node.id;
      toggle.dataset.outlineRole = "toggle";
      const glyph = ownerDocument.createElement("span");
      glyph.setAttribute("aria-hidden", "true");
      glyph.textContent = expanded ? "▾" : "▸";
      const accessible = ownerDocument.createElement("span");
      accessible.className = "prg-viewer-sr-only";
      accessible.textContent = `${expanded ? "折叠" : "展开"} ${nodeLabel(entry.node)} 的子节点`;
      toggle.append(glyph, accessible);
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        actions.toggleCollapse(entry.node.id);
      });
      row.append(toggle);
    } else {
      const spacer = ownerDocument.createElement("span");
      spacer.className = "prg-viewer-outline-spacer";
      spacer.setAttribute("aria-hidden", "true");
      row.append(spacer);
    }

    row.append(outlineItem(ownerDocument, entry.node, state.selected, (id) => actions.select(id)));
    item.append(row);

    if (hasChildren && expanded) {
      const children = ownerDocument.createElement("ul");
      children.className = "prg-viewer-outline-children";
      appendTreeEntries(ownerDocument, children, entry.children, state, actions);
      item.append(children);
    }

    list.append(item);
  }
}

/** Finds a rendered outline button by role and node id. */
function findOutlineButton(container: HTMLElement, role: string, id: string): HTMLElement | null {
  for (const button of container.querySelectorAll<HTMLElement>("[data-outline-role]")) {
    if (button.dataset.outlineRole === role && button.dataset.outlineId === id) return button;
  }
  return null;
}

/** Renders the outline in the mode requested by `state`; every node appears once. */
export function renderOutline(
  container: HTMLElement,
  document: PrgDocument,
  state: OutlineRenderState,
  actions: OutlineActions,
): void {
  const active = container.ownerDocument.activeElement;
  const hadFocus = container.contains(active);
  const focused = hadFocus && active ? (active as HTMLElement) : null;
  const focusedId = focused?.dataset.outlineId ?? null;
  const focusedRole = focused?.dataset.outlineRole ?? null;

  container.replaceChildren();
  if (state.mode === "tree") {
    renderTreeOutline(container, document, state, actions);
  } else {
    renderCategoryOutline(container, document, state.selected, (id) => actions.select(id));
  }

  if (focusedRole === "toggle" && focusedId) {
    const toggle = findOutlineButton(container, "toggle", focusedId);
    toggle?.focus({ preventScroll: true });
    toggle?.scrollIntoView({ block: "nearest" });
    return;
  }

  const selected = container.querySelector<HTMLElement>(".prg-viewer-outline-item.is-selected");
  if (selected) {
    if (hadFocus) selected.focus({ preventScroll: true });
    selected.scrollIntoView({ block: "nearest" });
  }
}
