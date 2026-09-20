/* Addresses of the legacy learning flow. Roadmaps are `topic/<id>`, blocks `module/<lesson key>`. */

export const LEGACY_PATH = "/legacy";

export function topicPath(id: string): string {
  return `${LEGACY_PATH}/topic/${id}`;
}

export function modulePath(id: string, key: string): string {
  return `${topicPath(id)}/module/${encodeURIComponent(key)}`;
}

export function moduleChatPath(id: string, key: string): string {
  return `${modulePath(id, key)}/chat`;
}
