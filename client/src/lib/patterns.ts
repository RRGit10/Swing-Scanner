/** Patterns that are not part of Chris Sain's class method (mirrors added on request); keep in sync with the server. */
export const NOT_CLASS_METHOD = new Set(['double_bottom', 'inverted_cup_and_handle', 'head_and_shoulders']);

export const isClassMethod = (type: string) => !NOT_CLASS_METHOD.has(type);
