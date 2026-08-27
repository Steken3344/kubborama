import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './events.js';

interface TestEvents {
  Foo: { value: number };
  Bar: { label: string };
}

describe('EventBus', () => {
  it('calls subscribed handlers with the emitted payload', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('Foo', handler);
    bus.emit('Foo', { value: 42 });
    expect(handler).toHaveBeenCalledExactlyOnceWith({ value: 42 });
  });

  it('supports multiple independent subscribers', () => {
    const bus = new EventBus<TestEvents>();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('Foo', a);
    bus.on('Foo', b);
    bus.emit('Foo', { value: 1 });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('never cross-fires between different event names', () => {
    const bus = new EventBus<TestEvents>();
    const fooHandler = vi.fn();
    const barHandler = vi.fn();
    bus.on('Foo', fooHandler);
    bus.on('Bar', barHandler);
    bus.emit('Foo', { value: 1 });
    expect(fooHandler).toHaveBeenCalledTimes(1);
    expect(barHandler).not.toHaveBeenCalled();
  });

  it('unsubscribe stops further calls', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    const unsubscribe = bus.on('Foo', handler);
    bus.emit('Foo', { value: 1 });
    unsubscribe();
    bus.emit('Foo', { value: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('emitting with no subscribers does not throw', () => {
    const bus = new EventBus<TestEvents>();
    expect(() => bus.emit('Foo', { value: 1 })).not.toThrow();
  });
});
