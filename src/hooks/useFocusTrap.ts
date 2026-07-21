import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Piège le focus clavier à l'intérieur de `containerRef` tant que `active`,
 * et restitue le focus à l'élément déclencheur à la fermeture — pattern
 * WAI-ARIA Dialog standard, absent des modales jusqu'ici (Tab/Shift+Tab
 * pouvait sortir vers le contenu masqué derrière).
 */
export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
): void {
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    triggerRef.current = document.activeElement as HTMLElement | null;

    // Toute la vérification est différée en microtask — pas seulement le
    // `.focus()` — pour s'exécuter *après* un éventuel focus initial déjà
    // programmé par le composant appelant via son propre `queueMicrotask`
    // (déclaré avant ce hook ⇒ sa microtask est mise en file avant la nôtre,
    // donc s'exécute avant). Sinon on écraserait ce focus intentionnel.
    queueMicrotask(() => {
      const container = containerRef.current;
      if (!container || container.contains(document.activeElement)) return;
      const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const el = containerRef.current;
      if (!el) return;
      const focusable = Array.from(
        el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const currentIndex = focusable.indexOf(
        document.activeElement as HTMLElement,
      );
      let nextIndex: number;
      if (e.shiftKey) {
        nextIndex = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1;
      } else {
        nextIndex =
          currentIndex === -1 || currentIndex === focusable.length - 1
            ? 0
            : currentIndex + 1;
      }
      e.preventDefault();
      focusable[nextIndex]?.focus();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const trigger = triggerRef.current;
      if (trigger && document.contains(trigger)) {
        trigger.focus();
      }
    };
  }, [active, containerRef]);
}
