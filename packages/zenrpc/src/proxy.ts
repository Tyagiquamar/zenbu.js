import type { RouterProxy } from "./types";
import { serialize } from "./protocol";
import type { createPendingRequests } from "./pending";

type ProxyDeps = {
  send: (data: string) => void;
  pending: ReturnType<typeof createPendingRequests>;
};

type PathNode = {
  parent: PathNode | null;
  prop: string | null;
  children: Map<string, unknown>;
};

export const createProxy = <T extends Record<string, any>>(
  deps: ProxyDeps,
): RouterProxy<T> => {
  let nextId = 0;

  // One proxy per traversal path, memoized in a tree keyed by the actual
  // property chain (no string join, so property names containing "." stay
  // unambiguous). Property access becomes a Map lookup instead of
  // allocating a fresh array + Proxy on every get.
  const makeNode = (parent: PathNode | null, prop: string | null): any => {
    const node: PathNode = {
      parent,
      prop,
      children: new Map(),
    };
    return new Proxy(function () {}, {
      get(_target, p) {
        if (typeof p === "symbol") return undefined;
        let child = node.children.get(p);
        if (!child) {
          child = makeNode(node, p as string);
          node.children.set(p, child);
        }
        return child;
      },
      apply(_target, _thisArg, args: unknown[]) {
        const path: string[] = [];
        for (let n: PathNode | null = node; n && n.prop !== null; n = n.parent) {
          path.unshift(n.prop);
        }
        const id = String(++nextId);
        const promise = deps.pending.add(id);
        deps.send(serialize({ type: "request", id, path, args }));
        return promise;
      },
    });
  };

  return makeNode(null, null) as RouterProxy<T>;
};
