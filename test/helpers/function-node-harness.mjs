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

export function getNodeDefinition(nodeId) {
  const definition = nodesById().get(nodeId);
  if (!definition) throw new Error(`Node ${nodeId} wurde in flow-src nicht gefunden.`);
  return definition;
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

export async function runFunctionNode(nodeId, options = {}) {
  const definition = getNodeDefinition(nodeId);
  if (definition.type !== "function") {
    throw new Error(`Node ${nodeId} ist kein Function-Node, sondern ${definition.type}.`);
  }
  return runFunctionSource(definition.func, options);
}
