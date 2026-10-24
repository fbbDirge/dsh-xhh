// The headless runner depends on this service, so no turn can precede the guard.
export const inject = ["tools"];
export function apply(ctx) {
  ctx.effect(() => ctx.tools.guard(() => "HeyBox generation is text-only; tools are disabled."));
  ctx.provide("heyboxGenerationGuard", {});
}
