import { describe, expect, it, vi } from "vitest";

import { createBrowserAudio } from "../../src/platform/browser/adapters";

function fakeMusicElement() {
  return {
    src: "",
    loop: false,
    preload: "",
    volume: 1,
    muted: false,
    currentTime: 99,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    removeAttribute: vi.fn(),
  };
}

describe("browser audio", () => {
  it("waits for interaction, loops a known soundtrack, and follows mute", () => {
    const music = fakeMusicElement();
    const audio = createBrowserAudio(
      [{ id: "briefing", src: "/codex-game/assets/audio/bgm/briefing.ogg", volume: 0.12 }],
      {
        createMusicElement: () => music as unknown as HTMLAudioElement,
        audioContextConstructor: null,
      },
    );

    audio.setSoundtrack("briefing");
    expect(music.play).not.toHaveBeenCalled();
    expect(music).toMatchObject({
      src: "/codex-game/assets/audio/bgm/briefing.ogg",
      loop: true,
      preload: "auto",
      volume: 0.12,
      currentTime: 0,
    });

    audio.cue("click");
    expect(music.play).toHaveBeenCalledTimes(1);

    audio.setMuted(true);
    expect(music.pause).toHaveBeenCalledTimes(2);
    expect(music.muted).toBe(true);

    audio.setMuted(false);
    expect(music.play).toHaveBeenCalledTimes(2);
    expect(music.muted).toBe(false);
  });

  it("silences unknown tracks and releases media exactly once", () => {
    const music = fakeMusicElement();
    const audio = createBrowserAudio(
      [{ id: "known", src: "/known.ogg" }],
      {
        createMusicElement: () => music as unknown as HTMLAudioElement,
        audioContextConstructor: null,
      },
    );

    audio.setSoundtrack("known");
    audio.setSoundtrack("missing");
    expect(music.removeAttribute).toHaveBeenCalledWith("src");

    audio.dispose();
    audio.dispose();
    expect(music.removeAttribute).toHaveBeenCalledTimes(2);
  });

  it("contains rejected media playback without interrupting game input", () => {
    const music = fakeMusicElement();
    music.play.mockRejectedValue(new Error("autoplay blocked"));
    const audio = createBrowserAudio(
      [{ id: "known", src: "/known.ogg" }],
      {
        createMusicElement: () => music as unknown as HTMLAudioElement,
        audioContextConstructor: null,
      },
    );

    audio.setSoundtrack("known");
    expect(() => audio.cue("click")).not.toThrow();
  });
});
