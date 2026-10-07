import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { parseBattlefield } from './actions';
import { BattlefieldBar } from './BattlefieldBar';
import { card } from './test/fixtures';

const terrain = [card('T01', 'terrain'), card('T07', 'terrain')];
const defs = Object.fromEntries(terrain.map((d) => [d.id, d]));

beforeAll(() => {
  // jsdom has no ResizeObserver; the bar only reports its height with it.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});

function renderBar(text: string) {
  const props = {
    text,
    layout: parseBattlefield(text),
    defs,
    onText: vi.fn(),
    onLayOut: vi.fn(),
    onClose: vi.fn(),
    onHeight: vi.fn(),
  };
  render(<BattlefieldBar {...props} />);
  return props;
}

describe('BattlefieldBar', () => {
  it('lays out a battlefield of known Terrain Cards', async () => {
    const { onLayOut } = renderBar('01 07v');
    await userEvent.click(screen.getByRole('button', { name: /ok/i }));
    expect(onLayOut).toHaveBeenCalledOnce();
  });

  it('refuses unknown and repeated Terrain Cards', () => {
    renderBar('01 01 99');
    expect(screen.getByRole('button', { name: /ok/i })).toBeDisabled();
    expect(screen.getByText('Unknown terrain: 99')).toBeInTheDocument();
    expect(screen.getByText('Typed more than once: 01')).toBeInTheDocument();
  });

  it('passes what is typed on, and closes on Escape', async () => {
    const { onText, onClose } = renderBar('');
    const input = screen.getByLabelText(/terrain/i);
    expect(input).toHaveFocus();
    await userEvent.type(input, '7');
    expect(onText).toHaveBeenCalledWith('7');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
