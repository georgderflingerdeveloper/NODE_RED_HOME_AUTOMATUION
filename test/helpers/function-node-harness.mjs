import {
  DEFAULT_SOURCE_ROOT,
  buildFlowFromSource,
} from "../../tools/flow-source/lib.mjs";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
let cachedNodes;

function nodesById() {
  if (!cachedNodes) {
    cachedNodes = new Map(
      buildFlowFromSource(DEFAULT_SOURCE_ROOT).nodes.map((node) => [node.id, node]),
    );
  }
  return cachedNodes;
}

export function resetFunctionNodeCache() {
  cachedNodes = undefined;
}

export function getNodeDefinition(nodeReference) {
  const reference = String(nodeReference);
  const definitionById = nodesById().get(reference);
  if (definitionById) return definitionById;

  const matchesByName = [...nodesById().values()].filter(
    (node) => node.type === "function" && node.name === reference,
  );
  if (matchesByName.length === 1) return matchesByName[0];
  if (matchesByName.length > 1) {
    const ids = matchesByName.map((node) => `${node.name} (${node.id})`).join(", ");
    throw new Error(`Function-Name "${reference}" ist mehrdeutig. Verwende eine eindeutige Node-ID: ${ids}`);
  }

  const matchesByNameCaseInsensitive = [...nodesById().values()].filter(
    (node) => node.type === "function" && node.name && node.name.toLowerCase() === reference.toLowerCase(),
  );
  if (matchesByNameCaseInsensitive.length === 1) return matchesByNameCaseInsensitive[0];
  if (matchesByNameCaseInsensitive.length > 1) {
    const ids = matchesByNameCaseInsensitive.map((node) => `${node.name} (${node.id})`).join(", ");
    throw new Error(`Function-Name "${reference}" ist mehrdeutig. Verwende eine eindeutige Node-ID: ${ids}`);
  }

  throw new Error(`Node ${reference} wurde in flow-src nicht gefunden. Verwende eine vorhandene Function-Node-ID oder den exakten Namen.`);
}

export function createContextStore(initialValues = {}) {
  const values = new Map(Object.entries(initialValues));
  return {
    get(key) {
      return values.get(key);
    },
    set(key, value) {
      values.set(key, value);
    },
    keys() {
      return [...values.keys()];
    },
    _values: values,
  };
}

export async function runFunctionSource(source, {
  msg = {},
  contextValues = {},
  flowValues = {},
  globalValues = {},
  envValues = {},
  waitAfterReturnMs = 0,
} = {}) {
  const sent = [];
  const statuses = [];
  const warnings = [];
  const errors = [];
  let doneCalled = false;

  const node = {
    send(value) {
      sent.push(value);
    },
    status(value) {
      statuses.push(value);
    },
    warn(value) {
      warnings.push(value);
    },
    error(value) {
      errors.push(value);
    },
    log() {},
    debug() {},
    done() {
      doneCalled = true;
    },
  };
  const context = createContextStore(contextValues);
  const flow = createContextStore(flowValues);
  const global = createContextStore(globalValues);
  const env = {
    get(key) {
      return envValues[key];
    },
  };
  const execute = new AsyncFunction("msg", "node", "context", "flow", "global", "env", source);
  const result = await execute(msg, node, context, flow, global, env);

  if (waitAfterReturnMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitAfterReturnMs));
  }

  return {
    result,
    msg,
    sent,
    statuses,
    warnings,
    errors,
    doneCalled,
    context,
    flow,
    global,
  };
}

export async function runFunctionNode(nodeReference, options = {}) {
  const definition = getNodeDefinition(nodeReference);
  if (definition.type !== "function") {
    throw new Error(`Node ${nodeReference} ist kein Function-Node, sondern ${definition.type}.`);
  }
  return runFunctionSource(definition.func, options);
}
