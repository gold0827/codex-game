export async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    window.requestAnimationFrame(finish);
    window.setTimeout(finish, 20);
  });
}

export function createFixtureAction(
  root: ParentNode,
): (name: string) => HTMLButtonElement {
  return (name) => {
    const button = root.querySelector<HTMLButtonElement>(`[data-action="${name}"]`);
    if (!button) throw new Error(`Missing Chrome fixture action ${name}.`);
    return button;
  };
}
