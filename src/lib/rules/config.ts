// Central business rule configuration (admin-tunable in a real deployment).
export const RULES = {
  tolerancePct: 0.1,          // +/-10% mileage tolerance vs standard
  amountTolerance: 1.0,       // currency rounding tolerance for amount check
  maxTankCapacity: 400,       // litres, hard ceiling if vehicle capacity unknown
  minMileage: 2,              // km/l floor considered plausible
  maxMileage: 25,             // km/l ceiling considered plausible
  maxDailyFillsPerVehicle: 1, // more than this same day => flag
  leakageDebitThreshold: 500, // currency; debit above => critical
  odometerMaxJump: 2000,      // km per single fill considered abnormal
} as const;
