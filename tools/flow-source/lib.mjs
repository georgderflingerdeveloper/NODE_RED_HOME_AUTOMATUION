import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = path.resolve(TOOL_DIR, "../..");
export const DEFAULT_FLOW_FILE = path.join(PROJECT_ROOT, "flows.json");
export const DEFAULT_SOURCE_ROOT = path.join(PROJECT_ROOT, "flow-src");
export const DEFAULT_FUNCTION_LIBRARY_ROOT = path.join(PROJECT_ROOT, "lib/functions/generated");
export const MANIFEST_NAME = "manifest.json";
export const SCHEMA_VERSION = 1;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function toPosix(value) {
  return value.split(path.sep).join("/");
}

export function slugify(value) {
  const slug = String(value || "unbenannt")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "unbenannt";
}

export function detectFormatting(raw) {
  const indentMatch = raw.match(/\n( +)\{/);
  return {
    indent: indentMatch ? indentMatch[1].length : 4,
    trailingNewline: raw.endsWith("\n"),
  };
}

export function formatFlow(nodes, formatting = { indent: 4, trailingNewline: false }) {
  const rendered = JSON.stringify(nodes, null, formatting.indent);
  return formatting.trailingNewline ? `${rendered}\n` : rendered;
}

export function readFlowFile(flowFile = DEFAULT_FLOW_FILE) {
  const raw = fs.readFileSync(flowFile, "utf8");
  const nodes = JSON.parse(raw);
  if (!Array.isArray(nodes)) {
    throw new Error(`${flowFile} muss ein JSON-Array enthalten.`);
  }
  return { raw, nodes, formatting: detectFormatting(raw) };
}

function assertInside(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Unsicherer Pfad außerhalb von ${resolvedRoot}: ${resolved}`);
  }
  return resolved;
}

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(fullPath));
    if (entry.isFile()) result.push(fullPath);
  }
  return result.sort();
}

function sourceFieldsForNode(node) {
  const fields = [];
  if (node.type === "function") {
    fields.push(["func", "js"]);
    if (node.initialize) fields.push(["initialize", "initialize.js"]);
    if (node.finalize) fields.push(["finalize", "finalize.js"]);
  }
  if (node.type === "ui_template") fields.push(["format", "html"]);
  if (node.type === "template") fields.push(["template", "txt"]);
  return fields;
}

function sourceFileName(node, field, extension) {
  const name = slugify(node.name || node.label || node.type);
  const suffix = field === "func" || field === "format" || field === "template" ? "" : `-${field}`;
  return `${name}--${node.id}${suffix}.${extension}`;
}

function workspaceNames(nodes) {
  return new Map(
    nodes
      .filter((node) => node.type === "tab" || node.type === "subflow")
      .map((node) => [node.id, node.name || node.label || node.id]),
  );
}

function workspaceFolders(nodes) {
  const names = workspaceNames(nodes);
  const folders = new Map();
  for (const node of nodes) {
    if (!node.z) continue;
    if (!folders.has(node.z)) {
      folders.set(node.z, `flows/${slugify(names.get(node.z) || node.z)}--${node.z}`);
    }
  }
  return folders;
}

function libraryHeader(node, flowName) {
  return [
    `// name: ${String(node.name || node.id).replace(/\r?\n/g, " ").trim()}`,
    `// nodeId: ${node.id}`,
    `// flow: ${String(flowName || node.z || "Konfiguration").replace(/\r?\n/g, " ").trim()}`,
    "",
  ].join("\n");
}

export function createFunctionLibraryPlan(nodes) {
  const names = workspaceNames(nodes);
  const library = new Map();
  for (const node of nodes) {
    if (node.type !== "function") continue;
    const flowName = names.get(node.z) || node.z || "Konfiguration";
    const flowFolder = `${slugify(flowName)}--${node.z || "configuration"}`;
    const relative = `${flowFolder}/${slugify(node.name || node.id)}--${node.id}.js`;
    library.set(relative, `${libraryHeader(node, flowName)}${node.func || ""}`);
  }
  return library;
}

export function createSourcePlan(nodes) {
  const folders = workspaceFolders(nodes);
  const groupedNodes = new Map();
  const sourceContents = new Map();
  const nodeFiles = {};

  for (const original of nodes) {
    const groupFolder = original.z && folders.has(original.z) ? folders.get(original.z) : "configuration";
    const nodesFile = `${groupFolder}/nodes.json`;
    nodeFiles[original.id] = nodesFile;
    if (!groupedNodes.has(nodesFile)) groupedNodes.set(nodesFile, []);

    const sourceDirectory = original.type === "function"
      ? `${groupFolder}/functions`
      : `${groupFolder}/templates`;
    const externalFields = new Map(sourceFieldsForNode(original).map(([field, extension]) => [field, extension]));
    const exported = {};

    for (const [key, value] of Object.entries(original)) {
      if (externalFields.has(key) && typeof value === "string") {
        const sourcePath = `${sourceDirectory}/${sourceFileName(original, key, externalFields.get(key))}`;
        sourceContents.set(sourcePath, value);
        exported[key] = { $flowSource: sourcePath };
      } else {
        exported[key] = value;
      }
    }
    groupedNodes.get(nodesFile).push(exported);
  }

  const generated = new Map(sourceContents);
  for (const [file, grouped] of groupedNodes) {
    generated.set(file, `${JSON.stringify(grouped, null, 2)}\n`);
  }

  return {
    generated,
    nodeFiles,
    nodeOrder: nodes.map((node) => node.id),
  };
}

export function readManifest(sourceRoot = DEFAULT_SOURCE_ROOT) {
  const manifestFile = path.join(sourceRoot, MANIFEST_NAME);
  if (!fs.existsSync(manifestFile)) return null;
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  if (manifest.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Nicht unterstützte flow-src-Version: ${manifest.schemaVersion}`);
  }
  return manifest;
}

export function dirtyGeneratedFiles(sourceRoot = DEFAULT_SOURCE_ROOT, manifest = readManifest(sourceRoot)) {
  if (!manifest) return [];
  const dirty = [];
  for (const [relative, expectedHash] of Object.entries(manifest.generatedFiles || {})) {
    const file = assertInside(sourceRoot, path.join(sourceRoot, relative));
    if (!fs.existsSync(file)) {
      dirty.push(`${relative} (fehlt)`);
      continue;
    }
    const actualHash = sha256(fs.readFileSync(file));
    if (actualHash !== expectedHash) dirty.push(relative);
  }
  return dirty;
}

function buildManifest({ flowFile, raw, formatting, plan, libraryPlan, libraryRoot }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    flowFile: path.basename(flowFile),
    flowSha256: sha256(raw),
    formatting,
    nodeOrder: plan.nodeOrder,
    nodeFiles: plan.nodeFiles,
    functionLibraryRoot: toPosix(path.relative(PROJECT_ROOT, libraryRoot)),
    functionLibraryFiles: Object.fromEntries(
      [...libraryPlan.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([relative, content]) => [relative, sha256(content)]),
    ),
    generatedFiles: Object.fromEntries(
      [...plan.generated.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([relative, content]) => [relative, sha256(content)]),
    ),
  };
}

export function exportFlowSource({
  flowFile = DEFAULT_FLOW_FILE,
  sourceRoot = DEFAULT_SOURCE_ROOT,
  libraryRoot = DEFAULT_FUNCTION_LIBRARY_ROOT,
  force = false,
} = {}) {
  const previousManifest = readManifest(sourceRoot);
  if (previousManifest && !force) {
    const dirty = dirtyGeneratedFiles(sourceRoot, previousManifest);
    const dirtyLibrary = dirtyFunctionLibraryFiles(libraryRoot, previousManifest);
    if (dirty.length) {
      throw new Error(
        `flow-src enthält Änderungen. Erst mit "npm run flow:import" übernehmen oder bewusst mit --force überschreiben:\n- ${dirty.join("\n- ")}`,
      );
    }
    if (dirtyLibrary.length) {
      throw new Error(
        `Die generierte Node-RED-Function-Bibliothek enthält Änderungen. Erst die gewünschte Version in den Flow übernehmen oder bewusst mit --force synchronisieren:\n- ${dirtyLibrary.join("\n- ")}`,
      );
    }
  } else if (!previousManifest && fs.existsSync(sourceRoot) && walkFiles(sourceRoot).length && !force) {
    throw new Error(`${sourceRoot} enthält Dateien ohne Manifest. Export nur mit --force möglich.`);
  }

  const { raw, nodes, formatting } = readFlowFile(flowFile);
  validateFlow(nodes);
  const plan = createSourcePlan(nodes);
  const libraryPlan = createFunctionLibraryPlan(nodes);
  const manifest = buildManifest({ flowFile, raw, formatting, plan, libraryPlan, libraryRoot });

  for (const [relative, content] of plan.generated) {
    atomicWrite(assertInside(sourceRoot, path.join(sourceRoot, relative)), content);
  }

  for (const relative of Object.keys(previousManifest?.generatedFiles || {})) {
    if (plan.generated.has(relative)) continue;
    const stale = assertInside(sourceRoot, path.join(sourceRoot, relative));
    if (fs.existsSync(stale)) fs.unlinkSync(stale);
  }

  writeFunctionLibrary({
    libraryRoot,
    libraryPlan,
    previousManifest,
  });

  atomicWrite(
    path.join(sourceRoot, MANIFEST_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return { manifest, fileCount: plan.generated.size, nodeCount: nodes.length };
}

export function dirtyFunctionLibraryFiles(
  libraryRoot = DEFAULT_FUNCTION_LIBRARY_ROOT,
  manifest = readManifest(DEFAULT_SOURCE_ROOT),
) {
  if (!manifest) return [];
  const dirty = [];
  for (const [relative, expectedHash] of Object.entries(manifest.functionLibraryFiles || {})) {
    const file = assertInside(libraryRoot, path.join(libraryRoot, relative));
    if (!fs.existsSync(file)) {
      dirty.push(`${relative} (fehlt)`);
      continue;
    }
    if (sha256(fs.readFileSync(file)) !== expectedHash) dirty.push(relative);
  }
  return dirty;
}

function writeFunctionLibrary({
  libraryRoot = DEFAULT_FUNCTION_LIBRARY_ROOT,
  libraryPlan,
  previousManifest,
}) {
  for (const [relative, content] of libraryPlan) {
    atomicWrite(assertInside(libraryRoot, path.join(libraryRoot, relative)), content);
  }
  for (const relative of Object.keys(previousManifest?.functionLibraryFiles || {})) {
    if (libraryPlan.has(relative)) continue;
    const stale = assertInside(libraryRoot, path.join(libraryRoot, relative));
    if (fs.existsSync(stale)) fs.unlinkSync(stale);
  }
}

function resolveExternalSources(value, sourceRoot, usedSources) {
  if (
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === 1
    && typeof value.$flowSource === "string"
  ) {
    const sourceFile = assertInside(sourceRoot, path.join(sourceRoot, value.$flowSource));
    if (!fs.existsSync(sourceFile)) throw new Error(`Quelldatei fehlt: ${value.$flowSource}`);
    usedSources.add(value.$flowSource);
    return fs.readFileSync(sourceFile, "utf8");
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveExternalSources(item, sourceRoot, usedSources));
  }
  if (value && typeof value === "object") {
    const resolved = {};
    for (const [key, nested] of Object.entries(value)) {
      resolved[key] = resolveExternalSources(nested, sourceRoot, usedSources);
    }
    return resolved;
  }
  return value;
}

export function buildFlowFromSource(sourceRoot = DEFAULT_SOURCE_ROOT) {
  const manifest = readManifest(sourceRoot);
  if (!manifest) throw new Error(`Manifest fehlt: ${path.join(sourceRoot, MANIFEST_NAME)}`);

  const nodeFiles = walkFiles(sourceRoot)
    .filter((file) => path.basename(file) === "nodes.json");
  if (!nodeFiles.length) throw new Error("Keine flow-src/nodes.json-Dateien gefunden.");

  const seenOrder = [];
  const nodeMap = new Map();
  const rebuiltNodeFiles = {};
  const usedSources = new Set();

  for (const file of nodeFiles) {
    const relative = toPosix(path.relative(sourceRoot, file));
    const grouped = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(grouped)) throw new Error(`${relative} muss ein JSON-Array enthalten.`);
    for (const node of grouped) {
      if (!node?.id) throw new Error(`Node ohne id in ${relative}`);
      if (nodeMap.has(node.id)) throw new Error(`Doppelte Node-id ${node.id}`);
      const resolved = resolveExternalSources(node, sourceRoot, usedSources);
      nodeMap.set(node.id, resolved);
      rebuiltNodeFiles[node.id] = relative;
      seenOrder.push(node.id);
    }
  }

  const retainedOrder = (manifest.nodeOrder || []).filter((id) => nodeMap.has(id));
  const retained = new Set(retainedOrder);
  const nodeOrder = [...retainedOrder, ...seenOrder.filter((id) => !retained.has(id))];
  const nodes = nodeOrder.map((id) => nodeMap.get(id));
  validateFlow(nodes);

  return {
    nodes,
    manifest,
    nodeOrder,
    nodeFiles: rebuiltNodeFiles,
    nodeSourceFiles: nodeFiles.map((file) => toPosix(path.relative(sourceRoot, file))),
    usedSources,
  };
}

export function refreshManifestAfterImport({
  sourceRoot = DEFAULT_SOURCE_ROOT,
  flowFile = DEFAULT_FLOW_FILE,
  libraryRoot = DEFAULT_FUNCTION_LIBRARY_ROOT,
  rendered,
  formatting,
  built,
}) {
  const generatedPaths = new Set([...built.nodeSourceFiles, ...built.usedSources]);
  const generatedFiles = {};
  for (const relative of [...generatedPaths].sort()) {
    const file = assertInside(sourceRoot, path.join(sourceRoot, relative));
    generatedFiles[relative] = sha256(fs.readFileSync(file));
  }
  const libraryPlan = createFunctionLibraryPlan(built.nodes);
  writeFunctionLibrary({ libraryRoot, libraryPlan, previousManifest: built.manifest });
  const updated = {
    ...built.manifest,
    flowFile: path.basename(flowFile),
    flowSha256: sha256(rendered),
    formatting,
    nodeOrder: built.nodeOrder,
    nodeFiles: built.nodeFiles,
    generatedFiles,
    functionLibraryRoot: toPosix(path.relative(PROJECT_ROOT, libraryRoot)),
    functionLibraryFiles: Object.fromEntries(
      [...libraryPlan.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([relative, content]) => [relative, sha256(content)]),
    ),
  };
  atomicWrite(path.join(sourceRoot, MANIFEST_NAME), `${JSON.stringify(updated, null, 2)}\n`);
  return updated;
}

export function importFlowSource({
  flowFile = DEFAULT_FLOW_FILE,
  sourceRoot = DEFAULT_SOURCE_ROOT,
  libraryRoot = DEFAULT_FUNCTION_LIBRARY_ROOT,
  write = false,
} = {}) {
  const built = buildFlowFromSource(sourceRoot);
  const formatting = built.manifest.formatting || { indent: 4, trailingNewline: false };
  const rendered = formatFlow(built.nodes, formatting);

  if (write) {
    const backupFile = path.join(path.dirname(flowFile), ".flow-import-backup.json");
    if (fs.existsSync(flowFile) && fs.readFileSync(flowFile, "utf8") !== rendered) {
      atomicWrite(backupFile, fs.readFileSync(flowFile));
    }
    atomicWrite(flowFile, rendered);
    refreshManifestAfterImport({ sourceRoot, flowFile, libraryRoot, rendered, formatting, built });
  }
  return { ...built, rendered, formatting };
}

export function validateFunctionLibrary(
  nodes,
  {
    sourceRoot = DEFAULT_SOURCE_ROOT,
    libraryRoot = DEFAULT_FUNCTION_LIBRARY_ROOT,
  } = {},
) {
  const manifest = readManifest(sourceRoot);
  if (!manifest) throw new Error("flow-src/manifest.json fehlt.");
  const expected = createFunctionLibraryPlan(nodes);
  const errors = [];
  for (const [relative, content] of expected) {
    const file = assertInside(libraryRoot, path.join(libraryRoot, relative));
    if (!fs.existsSync(file)) {
      errors.push(`${relative} fehlt`);
    } else if (fs.readFileSync(file, "utf8") !== content) {
      errors.push(`${relative} ist nicht synchron`);
    }
  }
  const recorded = new Set(Object.keys(manifest.functionLibraryFiles || {}));
  for (const relative of expected.keys()) {
    if (!recorded.has(relative)) errors.push(`${relative} fehlt im Manifest`);
  }
  if (errors.length) {
    throw new Error(`Function-Bibliothek ungültig:\n- ${errors.join("\n- ")}`);
  }
  return { functionFileCount: expected.size };
}

export function validateFlow(nodes) {
  if (!Array.isArray(nodes)) throw new Error("Flow muss ein Array sein.");
  const ids = new Set();
  const errors = [];
  let functionCount = 0;

  for (const node of nodes) {
    if (!node?.id) {
      errors.push("Node ohne id");
      continue;
    }
    if (ids.has(node.id)) errors.push(`Doppelte Node-id: ${node.id}`);
    ids.add(node.id);
  }

  for (const node of nodes) {
    for (const output of node.wires || []) {
      for (const target of output || []) {
        if (!ids.has(target)) errors.push(`Wire ${node.id} -> ${target} zeigt ins Leere`);
      }
    }
    for (const target of node.links || []) {
      if (!ids.has(target)) errors.push(`Link ${node.id} => ${target} zeigt ins Leere`);
    }
    if (node.type === "function") {
      functionCount += 1;
      for (const field of ["func", "initialize", "finalize"]) {
        if (!node[field]) continue;
        try {
          new vm.Script(`(async function(msg,node,context,flow,global,env){\n${node[field]}\n})`, {
            filename: `${node.id}.${field}.js`,
          });
        } catch (error) {
          errors.push(`${node.id}.${field}: ${error.message}`);
        }
      }
    }
  }

  if (errors.length) throw new Error(`Flow-Validierung fehlgeschlagen:\n- ${errors.join("\n- ")}`);
  return { nodeCount: nodes.length, functionCount };
}

export function validateFlowFile(flowFile = DEFAULT_FLOW_FILE) {
  const { nodes } = readFlowFile(flowFile);
  return validateFlow(nodes);
}
