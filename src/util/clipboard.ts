/** Clipboard helper with a fallback for environments without the async API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const element = document.createElement("textarea");
    element.value = text;
    element.setAttribute("readonly", "true");
    element.style.position = "fixed";
    element.style.opacity = "0";
    document.body.appendChild(element);
    element.select();
    const copied = document.execCommand("copy");
    element.remove();
    return copied;
  } catch {
    return false;
  }
}
