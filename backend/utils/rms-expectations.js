const normalizeFrequency = (frequency) => {
  const parsed = Number(frequency);
  if (Number.isNaN(parsed) || parsed < 1) {
    return 1;
  }
  if (![1, 2, 3].includes(parsed)) {
    return 1;
  }
  return parsed;
};

const isRmsExpected = (location, year, month) => {
  const frequency = normalizeFrequency(location?.rms_frequency ?? 1);
  const monthIndex = Number(month);
  if (!monthIndex || monthIndex < 1 || monthIndex > 12) {
    return false;
  }
  return ((monthIndex - 1) % frequency) === 0;
};

module.exports = {
  isRmsExpected,
  normalizeFrequency
};
