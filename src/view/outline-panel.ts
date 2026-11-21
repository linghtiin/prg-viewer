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

/** Display order shared by category mode and the root groups of tree mode. */
const GROUP_ORDER: readonly PrgNode["kind"][] = ["section", "text", "latex", "image", "unknown"];

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
  for (const kind of GROUP_ORDER) {
    const nodes = buckets.get(kind);
    if (nodes && nodes.length > 0) groups.push({ title: GROUP_TITLES[kind], nodes });
  }
  return groups;
}

/** One node in an outline tree, with its immediate children in display order. */
export interface OutlineTreeNode {
  node: PrgNode;
  children: OutlineTreeNode[];
}

/** One headed group of outline roots. */
export interface OutlineRootGroup {
  title: string;
  entries: OutlineTreeNode[];
}

interface EntryIndex {
  entries: OutlineTreeNode[];
  byId: Map<string, OutlineTreeNode>;
}

function indexEntries(document: PrgDocument): EntryIndex {
  const entries: OutlineTreeNode[] = [];
  const byId = new Map<string, OutlineTreeNode>();
  for (const id of document.order) {
    const node = document.nodes.get(id);
    if (!node || byId.has(id)) continue;
    const entry: OutlineTreeNode = { node, children: [] };
    byId.set(id, entry);
    entries.push(entry);
  }
  return { entries, byId };
}

interface Attachment {
  parentOf: Map<string, OutlineTreeNode>;
  attach: (parent: OutlineTreeNode, childId: string) => boolean;
}

/** Attaches children once each, refusing self references and cycles. */
function createAttachment(byId: ReadonlyMap<string, OutlineTreeNode>): Attachment {
  const parentOf = new Map<string, OutlineTreeNode>();
  const attach = (parent: OutlineTreeNode, childId: string): boolean => {
    const child = byId.get(childId);
    if (!child || parentOf.has(childId)) return false;
    if (isAncestorOf(parentOf, parent, childId)) return false;
    parentOf.set(childId, parent);
    parent.children.push(child);
    return true;
  };
  return { parentOf, attach };
}

/**
 * Builds the connection forest that tree mode shows in the node groups.
 *
 * Hierarchy comes only from `LineEdge` connections: containment is ignored, so a
 * frame drawn around a connected node never slips between that node and its edge
 * parent, while a frame that an edge points at becomes a child of that edge. For
 * the same reason a frame reached this way stays a leaf unless edges leave it —
 * its contained entities belong to the containment tree.
 *
 * Nodes outside every frame join as standalone roots even without connections,
 * so nothing uncontained disappears from tree mode. Frames that no connection
 * points at are not part of this forest at all; they are represented by
 * {@link buildContainmentTree}. A frame with no incoming edge therefore does not
 * drag its outgoing edges into a rooted-by-frame tree either: such edges are
 * skipped so their targets stay visible as roots.
 */
export function buildEdgeTree(document: PrgDocument): OutlineTreeNode[] {
  const { entries, byId } = indexEntries(document);
  const { parentOf, attach } = createAttachment(byId);
  const incoming = new Set<string>();
  for (const edge of document.edges) incoming.add(edge.to);
  const contained = new Set<string>();
  for (const entry of entries) {
    if (entry.node.kind !== "section") continue;
    for (const childId of entry.node.children) if (byId.has(childId)) contained.add(childId);
  }

  const participants = new Set<string>();
  for (const edge of document.edges) {
    if (edge.from === edge.to) continue;
    const parent = byId.get(edge.from);
    const child = byId.get(edge.to);
    if (!parent || !child) continue;
    if (parent.node.kind === "section" && !incoming.has(parent.node.id)) continue;
    participants.add(parent.node.id);
    participants.add(child.node.id);
    attach(parent, child.node.id);
  }
  for (const entry of entries) {
    if (entry.node.kind !== "section" && !contained.has(entry.node.id)) {
      participants.add(entry.node.id);
    }
  }

  sortByPosition(entries);
  return entries.filter((entry) => participants.has(entry.node.id) && !parentOf.has(entry.node.id));
}

/**
 * Builds the containment forest that tree mode shows under 分组.
 *
 * Hierarchy comes only from a frame's `children`, kept in authoring order: every
 * frame that is not inside another frame is a root, and the entities drawn inside
 * a frame (plain nodes and nested frames) become its children. This is the tree
 * that expands what a frame contains.
 */
export function buildContainmentTree(document: PrgDocument): OutlineTreeNode[] {
  const { entries, byId } = indexEntries(document);
  const { parentOf, attach } = createAttachment(byId);
  for (const entry of entries) {
    if (entry.node.kind !== "section") continue;
    for (const childId of entry.node.children) attach(entry, childId);
  }
  return entries.filter((entry) => entry.node.kind === "section" && !parentOf.has(entry.node.id));
}

/**
 * Builds the headed groups tree mode renders, in category-mode order.
 *
 * The 分组 group is the containment forest. The remaining groups hold the
 * connection forest, split by each tree root's node kind, so a connection tree
 * rooted at a node stays a node group even when it contains frames. A frame can
 * show up twice — as a root of 分组 and as an entry of a connection tree — but
 * each appearance expands only the children of its own tree.
 */
export function buildOutlineGroups(document: PrgDocument): OutlineRootGroup[] {
  const groups: OutlineRootGroup[] = [];
  const containment = buildContainmentTree(document);
  if (containment.length > 0) groups.push({ title: GROUP_TITLES.section, entries: containment });

  const edgeRoots = buildEdgeTree(document).filter((entry) => entry.node.kind !== "section");
  for (const kind of GROUP_ORDER) {
    if (kind === "section") continue;
    const entries = edgeRoots.filter((entry) => entry.node.kind === kind);
    if (entries.length > 0) groups.push({ title: GROUP_TITLES[kind], entries });
  }
  return groups;
}

/** Orders connection-derived children by canvas position (top→bottom, left→right). */
function sortByPosition(entries: readonly OutlineTreeNode[]): void {
  const orderIndex = new Map(entries.map((entry, index) => [entry.node.id, index]));
  const byPosition = (a: OutlineTreeNode, b: OutlineTreeNode): number =>
    a.node.rect.y - b.node.rect.y ||
    a.node.rect.x - b.node.rect.x ||
    (orderIndex.get(a.node.id) ?? 0) - (orderIndex.get(b.node.id) ?? 0);

  for (const entry of entries) {
    if (entry.children.length > 1) entry.children.sort(byPosition);
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

/**
 * Ids of every ancestor of `id` across the outline groups, outermost first.
 *
 * A node can appear in more than one group (a frame is a root of 分组 and can
 * also sit inside a connection tree), so all of its paths are merged. Empty when
 * the node has no parent or is unknown.
 */
export function outlineAncestors(document: PrgDocument, id: string): string[] {
  const ancestors: string[] = [];
  const visit = (entries: readonly OutlineTreeNode[], path: string[]): void => {
    for (const entry of entries) {
      if (entry.node.id === id) {
        for (const parentId of path) if (!ancestors.includes(parentId)) ancestors.push(parentId);
        continue;
      }
      path.push(entry.node.id);
      visit(entry.children, path);
      path.pop();
    }
  };
  for (const group of buildOutlineGroups(document)) visit(group.entries, []);
  return ancestors;
}

/** Ids of the nodes that own at least one child in any outline group. */
export function collapsibleOutlineIds(document: PrgDocument): string[] {
  const ids: string[] = [];
  const visit = (entries: readonly OutlineTreeNode[]): void => {
    for (const entry of entries) {
      if (entry.children.length > 0 && !ids.includes(entry.node.id)) ids.push(entry.node.id);
      visit(entry.children);
    }
  };
  for (const group of buildOutlineGroups(document)) visit(group.entries);
  return ids;
}

export type NavigationDirection = "up" | "down" | "left" | "right";

/**
 * One row currently visible in the outline.
 *
 * A node can appear in two groups — a frame is a root of 分组 and may also be
 * part of a connection tree — so rows are identified by `key` instead of by node
 * id. `parentKey` points at the row, not just the node, which keeps navigation
 * correct when both appearances have children.
 */
export interface OutlineRow {
  key: string;
  id: string;
  parentId: string | null;
  parentKey: string | null;
  hasChildren: boolean;
}

/**
 * Flattens the outline in display order. When `collapsed` is given, children of
 * those nodes are skipped, matching what the sidebar actually shows. Tree mode
 * renders one list per group, so the rows follow the grouped order.
 */
export function flattenOutline(document: PrgDocument, collapsed?: ReadonlySet<string>): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const visit = (
    entries: readonly OutlineTreeNode[],
    parent: OutlineRow | null,
    groupTitle: string,
  ): void => {
    for (const entry of entries) {
      const id = entry.node.id;
      const row: OutlineRow = {
        key: `${groupTitle}:${id}`,
        id,
        parentId: parent?.id ?? null,
        parentKey: parent?.key ?? null,
        hasChildren: entry.children.length > 0,
      };
      rows.push(row);
      if (entry.children.length > 0 && !collapsed?.has(id)) visit(entry.children, row, groupTitle);
    }
  };
  for (const group of buildOutlineGroups(document)) visit(group.entries, null, group.title);
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
 * `current` is a row key from {@link OutlineRow} (a node id also works for rows
 * that are unique). Up/down walk the visible rows; left/right go to the parent
 * or first child. In tree mode, left/right first collapse or expand the current
 * branch, which is the usual behaviour of nested trees. Category mode passes
 * rows without parents, so only up/down do anything there.
 */
export function resolveOutlineNavigation(
  rows: readonly OutlineRow[],
  current: string | null,
  direction: NavigationDirection,
  options: { allowCollapse: boolean; collapsed: ReadonlySet<string> } = NO_COLLAPSE,
): OutlineNavigation | null {
  let index = -1;
  if (current) {
    index = rows.findIndex((row) => row.key === current);
    if (index < 0) index = rows.findIndex((row) => row.id === current);
  }
  if (index < 0) {
    const first = rows[0];
    return first ? { kind: "select", id: first.id } : null;
  }
  const row = rows[index];
  if (!row) return null;

  if (direction === "left") {
    if (options.allowCollapse && row.hasChildren && !options.collapsed.has(row.id)) {
      return { kind: "collapse", id: row.id };
    }
    const parent = row.parentKey ? rows.find((candidate) => candidate.key === row.parentKey) : undefined;
    return parent ? { kind: "select", id: parent.id } : null;
  }

  if (direction === "right") {
    if (!row.hasChildren) return null;
    if (options.allowCollapse && options.collapsed.has(row.id)) {
      return { kind: "expand", id: row.id };
    }
    const next = rows[index + 1];
    return next && next.parentKey === row.key ? { kind: "select", id: next.id } : null;
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
  key: string,
  selected: ReadonlySet<string>,
  select: (id: string) => void,
  tree = false,
): HTMLButtonElement {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.className = "prg-viewer-outline-item";
  button.dataset.outlineId = node.id;
  button.dataset.outlineKey = key;
  button.dataset.outlineRole = "item";
  button.dataset.outlineKind = node.kind;
  const label = nodeLabel(node);
  button.textContent = truncate(label);
  button.title = label;
  if (tree && node.kind === "section") button.setAttribute("aria-label", `分组框：${label}`);
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
      container.append(outlineItem(ownerDocument, node, node.id, selected, select));
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
  const groups = buildOutlineGroups(document);
  if (groups.length === 0) {
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

  // Same grouped form as category mode: 分组 holds the containment trees, the
  // remaining groups hold connection trees split by their root's kind.
  for (const group of groups) {
    const heading = ownerDocument.createElement("h4");
    heading.textContent = `${group.title}（${group.entries.length}）`;
    container.append(heading);

    const list = ownerDocument.createElement("ul");
    list.className = "prg-viewer-outline-tree";
    appendTreeEntries(ownerDocument, list, group.entries, group.title, state, actions);
    container.append(list);
  }
}

function appendTreeEntries(
  ownerDocument: Document,
  list: HTMLUListElement,
  entries: readonly OutlineTreeNode[],
  groupTitle: string,
  state: OutlineRenderState,
  actions: OutlineActions,
): void {
  for (const entry of entries) {
    const key = `${groupTitle}:${entry.node.id}`;
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
      if (entry.node.kind === "section") toggle.classList.add("is-frame");
      toggle.dataset.outlineId = entry.node.id;
      toggle.dataset.outlineKey = key;
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
      // A frame without children still keeps the boxed corner so it does not
      // look like a plain node when it appears inside a connection tree.
      if (entry.node.kind === "section") spacer.classList.add("is-frame");
      spacer.setAttribute("aria-hidden", "true");
      row.append(spacer);
    }

    row.append(outlineItem(ownerDocument, entry.node, key, state.selected, (id) => actions.select(id), true));
    item.append(row);

    if (hasChildren && expanded) {
      const children = ownerDocument.createElement("ul");
      children.className = "prg-viewer-outline-children";
      appendTreeEntries(ownerDocument, children, entry.children, groupTitle, state, actions);
      item.append(children);
    }

    list.append(item);
  }
}

/** Finds a rendered outline button by role and row key. */
function findOutlineButton(container: HTMLElement, role: string, key: string): HTMLElement | null {
  for (const button of container.querySelectorAll<HTMLElement>("[data-outline-role]")) {
    if (button.dataset.outlineRole === role && button.dataset.outlineKey === key) return button;
  }
  return null;
}

/** Renders the outline in the mode requested by `state`. */
export function renderOutline(
  container: HTMLElement,
  document: PrgDocument,
  state: OutlineRenderState,
  actions: OutlineActions,
): void {
  const active = container.ownerDocument.activeElement;
  const hadFocus = container.contains(active);
  const focused = hadFocus && active ? (active as HTMLElement) : null;
  const focusedKey = focused?.dataset.outlineKey ?? null;
  const focusedRole = focused?.dataset.outlineRole ?? null;

  container.replaceChildren();
  if (state.mode === "tree") {
    renderTreeOutline(container, document, state, actions);
  } else {
    renderCategoryOutline(container, document, state.selected, (id) => actions.select(id));
  }

  if (focusedRole && focusedKey) {
    const restored = findOutlineButton(container, focusedRole, focusedKey);
    if (restored) {
      if (hadFocus) restored.focus({ preventScroll: true });
      restored.scrollIntoView({ block: "nearest" });
      return;
    }
  }

  const selected = container.querySelector<HTMLElement>(".prg-viewer-outline-item.is-selected");
  if (selected) {
    if (hadFocus) selected.focus({ preventScroll: true });
    selected.scrollIntoView({ block: "nearest" });
  }
}
