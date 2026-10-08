const UPDATE_FIELD_COUNT: i32 = 7;

const MIN_INSTRUMENT_COUNT: i32 = 1;
const MAX_INSTRUMENT_COUNT: i32 = 50;

const MIN_BATCH_SIZE: i32 = 1;
const MAX_BATCH_SIZE: i32 = 1_000;

const MIN_PRICE_CENTS: i32 = 100;
const MIN_INITIAL_PRICE_CENTS: i32 = 5_000;
const MAX_INITIAL_PRICE_CENTS: i32 = 20_000;

let instrumentCount: i32 = 0;
let randomState: u32 = 1;
let prices = new Int32Array(0);

/**
 * Xorshift32 is a small deterministic PRNG.
 *
 * The same seed produces the same sequence.
 */
function nextRandom(): u32 {
  let value = randomState;

  value ^= value << 13;
  value ^= value >> 17;
  value ^= value << 5;

  randomState = value;

  return value;
}

function randomInteger(minimumInclusive: i32, maximumInclusive: i32): i32 {
  const range = <u32>(maximumInclusive - minimumInclusive + 1);

  return minimumInclusive + <i32>(nextRandom() % range);
}

/**
 * Starts a new generator run.
 *
 * Calling initialize again clears the previous run state.
 */
export function initialize(newInstrumentCount: i32, seed: u32): void {
  assert(
    newInstrumentCount >= MIN_INSTRUMENT_COUNT && newInstrumentCount <= MAX_INSTRUMENT_COUNT,
    'Instrument count must be between 1 and 50',
  );

  instrumentCount = newInstrumentCount;

  // Xorshift must not start from a zero state.
  randomState = seed == 0 ? 0x6d2b79f5 : seed;

  prices = new Int32Array(instrumentCount);

  for (let index: i32 = 0; index < instrumentCount; index++) {
    prices[index] = randomInteger(MIN_INITIAL_PRICE_CENTS, MAX_INITIAL_PRICE_CENTS);
  }
}

/**
 * Number of numeric fields in one update.
 */
export function updateFieldCount(): i32 {
  return UPDATE_FIELD_COUNT;
}

/**
 * Generates the requested number of market updates.
 */
export function generateBatch(updateCount: i32): Int32Array {
  assert(instrumentCount > 0, 'Producer must be initialized before generating data');

  assert(
    updateCount >= MIN_BATCH_SIZE && updateCount <= MAX_BATCH_SIZE,
    'Batch size must be between 1 and 1000',
  );

  const result = new Int32Array(updateCount * UPDATE_FIELD_COUNT);

  let outputIndex: i32 = 0;

  for (let updateIndex: i32 = 0; updateIndex < updateCount; updateIndex++) {
    const instrumentIndex = randomInteger(0, instrumentCount - 1);

    const previousPrice = prices[instrumentIndex];

    // Move every trade up or down without an upward bias.
    const movement = randomInteger(1, 5);
    const direction = randomInteger(0, 1) == 0 ? -1 : 1;

    let priceCents = previousPrice + direction * movement;

    if (priceCents < MIN_PRICE_CENTS) {
      priceCents = previousPrice + movement;
    }

    const spread = randomInteger(1, 10);
    const tradeAtBid = randomInteger(0, 1) == 0;
    const bidCents = tradeAtBid ? priceCents : priceCents - spread;
    const askCents = tradeAtBid ? priceCents + spread : priceCents;

    const tradeQuantity = randomInteger(1, 100);
    const bidQuantity = randomInteger(0, 1_000);
    const askQuantity = randomInteger(0, 1_000);

    // The next update for this instrument continues from this price.
    prices[instrumentIndex] = priceCents;

    result[outputIndex++] = instrumentIndex;
    result[outputIndex++] = priceCents;
    result[outputIndex++] = tradeQuantity;
    result[outputIndex++] = bidCents;
    result[outputIndex++] = askCents;
    result[outputIndex++] = bidQuantity;
    result[outputIndex++] = askQuantity;
  }

  return result;
}
