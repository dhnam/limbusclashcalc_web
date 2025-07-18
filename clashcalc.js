// JavaScript version of Limbus Battle Calc
// This is a direct translation from the Python code provided, including structure and logic

class Skill {
  constructor(base_coin, coin_val, coin_count, sanity, paralyze = 0) {
    this.base_coin = base_coin;
    this.coin_val = coin_val;
    this.coin_count = coin_count;
    this.sanity = sanity;
    this.paralyze = paralyze;
    this._headProb = null;
    this._probDict = null;
    this._sortedProbItems = null;
    this._cumulativeProb = null;
  }

  get headProb() {
    if (this._headProb === null) {
      this._headProb = (50 + this.sanity) / 100;
    }
    return this._headProb;
  }

  get probDict() {
    if (this._probDict === null) {
      const coin_flipped = Math.max(0, this.coin_count - this.paralyze);
      const result = {};
      for (let i = 0; i <= coin_flipped; i++) {
        const power = Math.max(0, this.base_coin + this.coin_val * i);
        const prob = Math.pow(this.headProb, i) *
                     Math.pow(1 - this.headProb, coin_flipped - i) *
                     comb(coin_flipped, i);
        result[power] = (result[power] || 0) + prob;
      }
      this._probDict = result;
    }
    return this._probDict;
  }

  get sortedProbItems() {
    if (this._sortedProbItems === null) {
      this._sortedProbItems = Object.entries(this.probDict)
        .map(([k, v]) => [parseInt(k), v])
        .sort((a, b) => a[0] - b[0]);
    }
    return this._sortedProbItems;
  }

  get cumulativeProb() {
    if (this._cumulativeProb === null) {
      const result = [];
      let acc = 0.0;
      for (const [k, v] of this.sortedProbItems) {
        acc += v;
        result.push([k, acc]);
      }
      this._cumulativeProb = result;
    }
    return this._cumulativeProb;
  }

  afterWin() {
    return new Skill(this.base_coin, this.coin_val, this.coin_count, this.sanity, Math.max(0, this.paralyze - this.coin_count));
  }

  afterLose() {
    return new Skill(this.base_coin, this.coin_val, this.coin_count - 1, this.sanity, Math.max(0, this.paralyze - this.coin_count));
  }
}

class ProbResult {
  constructor(probability, coin_count, paralyze, opp_paralyze) {
    this.probability = probability;
    this.coin_count = coin_count;
    this.paralyze = paralyze;
    this.opp_paralyze = opp_paralyze;
  }
}

function singleClashProb(left, right) {
  let left_winrate = 0.0;
  let draw_rate = 0.0;
  let right_winrate = 0.0;

  const rightDict = right.probDict;
  const rightCDF = right.cumulativeProb;
  const rightKeys = rightCDF.map(([k]) => k);
  const rightVals = rightCDF.map(([, v]) => v);

  for (const [leftVal, leftProb] of left.sortedProbItems) {
    const idx = lowerBound(rightKeys, leftVal);
    const lessThan = idx > 0 ? rightVals[idx - 1] : 0.0;
    const equal = rightDict[leftVal] || 0.0;
    const greater = 1.0 - (lessThan + equal);

    left_winrate += leftProb * lessThan;
    draw_rate += leftProb * equal;
    right_winrate += leftProb * greater;
  }

  return [left_winrate, draw_rate, right_winrate];
}

function winProbability(left, right, cache = new Map()) {
  const key = `${left.coin_count},${left.paralyze},${right.coin_count},${right.paralyze}`;
  if (cache.has(key)) return cache.get(key);

  if (left.coin_count === 0)
    return cache.set(key, [[], [new ProbResult(1.0, right.coin_count, right.paralyze, left.paralyze)]]).get(key);

  if (right.coin_count === 0)
    return cache.set(key, [[new ProbResult(1.0, left.coin_count, left.paralyze, right.paralyze)], []]).get(key);

  let [leftWin, draw, rightWin] = singleClashProb(left, right);

  if (left.paralyze === 0 && right.paralyze === 0) {
    const tot = leftWin + rightWin;
    if (tot === 0) return cache.set(key, [[], []]).get(key);
    leftWin = leftWin / tot;
    rightWin = rightWin / tot;
    draw = 0;
  }

  let leftWinRes = [[], []];
  if (leftWin > 0)
    leftWinRes = winProbability(left.afterWin(), right.afterLose(), cache);

  let drawWinRes = [[], []];
  if (draw > 0)
    drawWinRes = winProbability(left.afterWin(), right.afterWin(), cache);

  let rightWinRes = [[], []];
  if (rightWin > 0)
    rightWinRes = winProbability(left.afterLose(), right.afterWin(), cache);

  const leftDict = new Map();
  const rightDict = new Map();

  for (const [caseProb, winRes] of [[leftWin, leftWinRes], [draw, drawWinRes], [rightWin, rightWinRes]]) {
    for (const nextRes of winRes[0]) {
      const k = `${nextRes.coin_count},${nextRes.paralyze},${nextRes.opp_paralyze}`;
      leftDict.set(k, (leftDict.get(k) || 0) + caseProb * nextRes.probability);
    }
    for (const nextRes of winRes[1]) {
      const k = `${nextRes.coin_count},${nextRes.paralyze},${nextRes.opp_paralyze}`;
      rightDict.set(k, (rightDict.get(k) || 0) + caseProb * nextRes.probability);
    }
  }

  const res = [[], []];
  for (const [k, v] of [...leftDict.entries()].sort()) {
    const [cc, pz, opz] = k.split(',').map(Number);
    res[0].push(new ProbResult(v, cc, pz, opz));
  }
  for (const [k, v] of [...rightDict.entries()].sort()) {
    const [cc, pz, opz] = k.split(',').map(Number);
    res[1].push(new ProbResult(v, cc, pz, opz));
  }

  return cache.set(key, res).get(key);
}

function comb(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let res = 1;
  for (let i = 1; i <= k; i++) {
    res = res * (n - i + 1) / i;
  }
  return res;
}

function lowerBound(arr, target) {
  let left = 0, right = arr.length;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] < target) left = mid + 1;
    else right = mid;
  }
  return left;
}
