// Registers Grimm World with the engine and the UI on import: main.tsx imports it before anything else, so that modules
// reading the game on import (a value kept on the device, `storage().get()`) find it registered.

import { registerGame } from './game';

registerGame();
