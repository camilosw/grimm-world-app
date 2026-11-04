import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { grimmWorldUI } from '../../game';
import { type ContentProvider, useContent } from './content';
import { setGameUI } from './gameUI';
import { Toolbar } from './Toolbar';
import { Tray } from './Tray';

afterEach(() => setGameUI(grimmWorldUI));

const toolbar = () =>
  render(
    <Toolbar
      sidebarOpen={false}
      toggleSidebar={() => {}}
      history={0}
      contentOpen={false}
      setContentOpen={() => {}}
      openContent={() => {}}
      setDialog={() => {}}
      onFit={() => {}}
    />,
  );

/** A game's content: a guide loaded as `loads` says. */
const guide = (loads: () => Promise<unknown>): ContentProvider => ({
  label: 'Guide',
  icon: '?',
  load: vi.fn(loads),
  Panel: () => null,
  pileSection: () => null,
  cardSection: () => null,
  areaSection: () => null,
});

describe('the game content', () => {
  it('has the toolbar offer it by its name, and nothing when the game has none', () => {
    toolbar();
    expect(screen.getByRole('button', { name: /Rules/ })).toBeInTheDocument();
    setGameUI({ ...grimmWorldUI, content: guide(async () => 'text') });
    toolbar();
    expect(screen.getByRole('button', { name: /Guide/ })).toBeInTheDocument();
    setGameUI({ ...grimmWorldUI, content: undefined });
    const { container } = toolbar();
    expect(container).not.toHaveTextContent(/Rules|Guide/);
  });

  it('opens at a section, loading the content the first time only', async () => {
    const provider = guide(async () => 'text');
    setGameUI({ ...grimmWorldUI, content: provider });
    const { result } = renderHook(() => useContent(vi.fn()));
    await act(async () => result.current.openContent('4.7'));
    expect(result.current.contentOpen).toBe(true);
    expect(result.current.loadedContent).toEqual({ content: 'text' });
    expect(result.current.contentTarget).toEqual({ section: '4.7' });
    act(() => result.current.setContentOpen(false));
    await act(async () => result.current.openContent());
    expect(result.current.contentOpen).toBe(true);
    expect(provider.load).toHaveBeenCalledTimes(1);
  });

  it('tells the player why it could not be loaded, and stays closed', async () => {
    setGameUI({
      ...grimmWorldUI,
      content: guide(async () => {
        throw new Error('No guide yet');
      }),
    });
    const notify = vi.fn();
    const { result } = renderHook(() => useContent(notify));
    await act(async () => result.current.openContent('1'));
    expect(notify).toHaveBeenCalledWith('No guide yet');
    expect(result.current.contentOpen).toBe(false);
  });

  it('opens nothing for a game without content', async () => {
    setGameUI({ ...grimmWorldUI, content: undefined });
    const { result } = renderHook(() => useContent(vi.fn()));
    await act(async () => result.current.openContent('1'));
    expect(result.current.contentOpen).toBe(false);
  });
});

it('names the right sidebar as the game says (the Hand)', () => {
  setGameUI({
    ...grimmWorldUI,
    texts: { ...grimmWorldUI.texts, tray: 'Reserve' },
  });
  render(
    <Tray
      piles={[]}
      defs={{}}
      collapsed
      onCollapse={() => {}}
      selectedId={null}
      hover={null}
      onTap={() => {}}
      onDoubleTap={() => {}}
      onInspect={() => {}}
      onDragHover={() => {}}
      onDrop={() => {}}
    />,
  );
  expect(screen.getByRole('complementary', { name: 'Reserve' })).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Show the Reserve' }),
  ).toBeVisible();
});
