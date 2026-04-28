// Auto Advisor — data only.
// Loaded as a classic script before auto-advisor.html's inline script.
// Top-level const declarations live in the script's shared scope and
// are reachable by subsequent inline scripts in the same document.

  // ---------- archetypes ----------
  // priceBand: { new, nearlyNew, used, old } — typical RO market range, EUR.
  // consumption: { type: 'petrol'|'diesel'|'lpg'|'kwh', value: number per 100 km }.
  // For PHEV: average effective consumption assuming home-charged daily.
  const ARCHETYPES = [
    {
      id: 'city-petrol-hatch',
      name: 'City Petrol Hatch',
      desc: 'Small, light, cheap to insure. Best fit for tight cities and < 15k km/yr.',
      body: 'hatch', fuels: ['petrol'], drive: 'fwd',
      seats: 5, engineCC: 1200,
      examples: ['VW Polo', 'Toyota Yaris', 'Skoda Fabia', 'Renault Clio', 'Hyundai i20'],
      pros: ['Cheap to buy &amp; insure', 'Low fuel use in stop-go traffic', 'Easy to park'],
      cons: ['Cramped on long trips', 'Resale flat after 10 yrs'],
      priceBand: { new: [16000, 24000], nearlyNew: [12000, 18000], used: [6000, 13000], old: [2500, 7000] },
      consumption: { type: 'petrol', value: 6.0 },
      insurance: 'low', maintenance: 'low', depreciation: 'normal',
      score: (a) => {
        let s = 0;
        if (a.bodyPref === 'hatch') s += 30; else if (a.bodyPref === 'open') s += 12;
        if (a.fuelPref === 'petrol' || a.fuelPref === 'open') s += 15;
        if (a.drivingMix === 'city') s += 20;
        if (a.drivingMix === 'mixed') s += 8;
        if (a.drivingMix === 'highway') s -= 12;
        if (a.drivingMix === 'offroad') s -= 50;
        if (a.annualKm <= 15000) s += 10; else if (a.annualKm >= 27500) s -= 15;
        if (a.seats === '4-5' || a.seats === '2') s += 8;
        if (a.seats === '6-7' || a.seats === 'cargo') s -= 50;
        if (a.towing !== 'none') s -= 15;
        if (a.childSeats >= 2) s -= 8;
        if (a.reliability === 'bulletproof') s += 6;
        return s;
      },
    },
    {
      id: 'compact-petrol-sedan',
      name: 'Compact Petrol Sedan',
      desc: 'Roomier than a hatch, slightly cheaper to run than a crossover. Comfortable family runabout.',
      body: 'sedan', fuels: ['petrol', 'lpg'], drive: 'fwd',
      seats: 5, engineCC: 1500,
      examples: ['Skoda Octavia 1.0 TSI', 'Dacia Logan', 'Toyota Corolla Sedan', 'Hyundai Elantra'],
      pros: ['Big trunk, good rear legroom', 'Cheap parts (esp. Dacia)', 'LPG conversion popular'],
      cons: ['Not exciting', 'Depreciates if 1.0 TSI engine has known issues'],
      priceBand: { new: [18000, 28000], nearlyNew: [13000, 21000], used: [6500, 14000], old: [3000, 8000] },
      consumption: { type: 'petrol', value: 6.2 },
      insurance: 'low', maintenance: 'low', depreciation: 'normal',
      score: (a) => {
        let s = 0;
        if (a.bodyPref === 'sedan') s += 30; else if (a.bodyPref === 'open') s += 10;
        if (a.fuelPref === 'petrol' || a.fuelPref === 'open' || a.fuelPref === 'lpg') s += 15;
        if (a.drivingMix === 'mixed' || a.drivingMix === 'city') s += 12;
        if (a.drivingMix === 'highway') s += 6;
        if (a.drivingMix === 'offroad') s -= 50;
        if (a.seats === '4-5') s += 10;
        if (a.seats === '6-7' || a.seats === 'cargo') s -= 50;
        if (a.annualKm >= 27500) s -= 8;
        if (a.towing === 'heavy') s -= 25;
        if (a.childSeats >= 2) s += 4;
        return s;
      },
    },
    {
      id: 'highway-diesel-sedan',
      name: 'Highway Diesel Sedan / Combi',
      desc: 'High-mileage commuter weapon. Cheap fuel per km, comfy on the autostrada.',
      body: 'sedan', fuels: ['diesel'], drive: 'fwd',
      seats: 5, engineCC: 2000,
      examples: ['VW Passat TDI', 'Skoda Superb TDI', 'Audi A4 TDI', 'BMW 320d', 'Ford Mondeo TDCi'],
      pros: ['5–6 L/100 km on the highway', 'Big tanks → 1000+ km range', 'Massive used selection'],
      cons: ['DPF clogs in city use', 'AdBlue + EGR maintenance', 'Older diesels banned in some EU cities'],
      priceBand: { new: [38000, 60000], nearlyNew: [25000, 45000], used: [9000, 22000], old: [3500, 10000] },
      consumption: { type: 'diesel', value: 5.8 },
      insurance: 'mid', maintenance: 'mid', depreciation: 'normal',
      score: (a) => {
        let s = 0;
        if (a.bodyPref === 'sedan' || a.bodyPref === 'combi') s += 25;
        else if (a.bodyPref === 'open') s += 8;
        if (a.fuelPref === 'diesel') s += 30; else if (a.fuelPref === 'open') s += 5;
        if (a.fuelPref === 'bev' || a.fuelPref === 'phev' || a.fuelPref === 'hev') s -= 15;
        if (a.drivingMix === 'highway') s += 25;
        if (a.drivingMix === 'mixed') s += 5;
        if (a.drivingMix === 'city') s -= 18;
        if (a.drivingMix === 'offroad') s -= 40;
        if (a.annualKm >= 27500) s += 18;
        if (a.annualKm <= 10000) s -= 18;
        if (a.seats === 'cargo' || a.seats === '6-7') s -= 30;
        if (a.towing === 'light') s += 4; if (a.towing === 'heavy') s += 2;
        if (a.reliability === 'bulletproof' && a.condition === 'old') s -= 8;
        return s;
      },
    },
    {
      id: 'family-combi-diesel',
      name: 'Family Diesel Combi',
      desc: 'King of the long-trip family car: enormous boot, low highway fuel, two child seats fit easily.',
      body: 'combi', fuels: ['diesel'], drive: 'fwd',
      seats: 5, engineCC: 2000,
      examples: ['Skoda Octavia Combi TDI', 'VW Passat Variant TDI', 'Ford Focus Combi TDCi', 'Opel Astra Sports Tourer'],
      pros: ['Boot bigger than most SUVs', 'Lower drag = better fuel than SUV', 'Cheap parts'],
      cons: ['Less ground clearance', 'DPF risk if mostly city', 'Less "premium" feel than SUV'],
      priceBand: { new: [28000, 42000], nearlyNew: [20000, 32000], used: [8000, 18000], old: [3000, 9000] },
      consumption: { type: 'diesel', value: 5.6 },
      insurance: 'mid', maintenance: 'mid', depreciation: 'normal',
      score: (a) => {
        let s = 0;
        if (a.bodyPref === 'combi') s += 32; else if (a.bodyPref === 'open') s += 14;
        if (a.fuelPref === 'diesel') s += 25; else if (a.fuelPref === 'open') s += 6;
        if (a.drivingMix === 'highway' || a.drivingMix === 'mixed') s += 18;
        if (a.drivingMix === 'city') s -= 12;
        if (a.drivingMix === 'offroad') s -= 40;
        if (a.annualKm >= 15000) s += 12;
        if (a.seats === '4-5') s += 12;
        if (a.seats === 'cargo') s += 5;
        if (a.seats === '6-7') s -= 35;
        if (a.childSeats >= 2) s += 8;
        if (a.towing === 'light') s += 5; if (a.towing === 'heavy') s -= 5;
        return s;
      },
    },
    {
      id: 'family-combi-petrol',
      name: 'Family Petrol Combi',
      desc: 'Same big boot as the diesel version, but better suited if you do < 20k km/yr or lots of city.',
      body: 'combi', fuels: ['petrol', 'mhev'], drive: 'fwd',
      seats: 5, engineCC: 1500,
      examples: ['Skoda Octavia Combi 1.5 TSI', 'Opel Astra Sports Tourer 1.2', 'Peugeot 308 SW PureTech'],
      pros: ['No DPF/AdBlue headaches', 'Cheaper to insure than diesel equivalents', 'Quiet around town'],
      cons: ['7–8 L/100 km on highway', 'Less torque for towing'],
      priceBand: { new: [25000, 38000], nearlyNew: [18000, 28000], used: [7000, 15000], old: [3000, 8000] },
      consumption: { type: 'petrol', value: 7.2 },
      insurance: 'low', maintenance: 'low', depreciation: 'normal',
      score: (a) => {
        let s = 0;
        if (a.bodyPref === 'combi') s += 30; else if (a.bodyPref === 'open') s += 12;
        if (a.fuelPref === 'petrol' || a.fuelPref === 'open' || a.fuelPref === 'mhev') s += 18;
        if (a.drivingMix === 'mixed' || a.drivingMix === 'city') s += 12;
        if (a.drivingMix === 'highway') s += 4;
        if (a.drivingMix === 'offroad') s -= 40;
        if (a.annualKm <= 20000) s += 8; else if (a.annualKm >= 35000) s -= 12;
        if (a.seats === '4-5') s += 12;
        if (a.seats === '6-7') s -= 35;
        if (a.childSeats >= 2) s += 6;
        if (a.towing === 'heavy') s -= 12;
        return s;
      },
    },
    {
      id: 'compact-crossover-petrol',
      name: 'Compact Crossover Petrol',
      desc: 'Higher seating, modern tech, family-sized but still fits city parking.',
      body: 'crossover', fuels: ['petrol', 'mhev'], drive: 'fwd',
      seats: 5, engineCC: 1500,
      examples: ['VW T-Roc', 'Skoda Kamiq', 'Renault Captur', 'Hyundai Kona', 'Toyota Yaris Cross'],
      pros: ['Easier in/out vs hatch', 'Trendy resale stays strong', 'Mild-hybrid options sip in city'],
      cons: ['Worse fuel than equivalent hatch', 'Smaller boot than combi'],
      priceBand: { new: [24000, 36000], nearlyNew: [18000, 28000], used: [9000, 17000], old: [4000, 10000] },
      consumption: { type: 'petrol', value: 7.0 },
      insurance: 'mid', maintenance: 'low', depreciation: 'normal',
      score: (a) => {
        let s = 0;
        if (a.bodyPref === 'crossover' || a.bodyPref === 'suv') s += 25;
        else if (a.bodyPref === 'open') s += 14;
        if (a.fuelPref === 'petrol' || a.fuelPref === 'open' || a.fuelPref === 'mhev') s += 15;
        if (a.drivingMix === 'mixed' || a.drivingMix === 'city') s += 14;
        if (a.drivingMix === 'highway') s += 2;
        if (a.drivingMix === 'offroad') s -= 25;
        if (a.annualKm <= 20000) s += 6;
        if (a.seats === '4-5') s += 10;
        if (a.seats === '6-7' || a.seats === 'cargo') s -= 30;
        if (a.climate === 'cold' || a.climate === 'mountain') s += 5;
        if (a.childSeats >= 1) s += 4;
        return s;
      },
    },
    {
      id: 'mid-suv-diesel',
      name: 'Mid-size Diesel SUV',
      desc: 'Family workhorse: roomy, decent towing, good for highway + light unpaved roads.',
      body: 'suv', fuels: ['diesel'], drive: 'awd',
      seats: 5, engineCC: 2000,
      examples: ['VW Tiguan TDI', 'Hyundai Tucson 1.6 CRDi', 'Kia Sportage CRDi', 'Mazda CX-5 Skyactiv-D'],
      pros: ['Tows up to ~2 t', 'Highway 6.5–7.5 L/100', 'Big aftermarket'],
      cons: ['Heavy = expensive tires', 'AdBlue / DPF maintenance', 'Bulkier in tight cities'],
      priceBand: { new: [38000, 55000], nearlyNew: [28000, 42000], used: [12000, 25000], old: [5000, 13000] },
      consumption: { type: 'diesel', value: 7.0 },
      insurance: 'mid', maintenance: 'mid', depreciation: 'normal',
      score: (a) => {
        let s = 0;
        if (a.bodyPref === 'suv') s += 28; else if (a.bodyPref === 'crossover') s += 16;
        else if (a.bodyPref === 'open') s += 10;
        if (a.fuelPref === 'diesel') s += 22; else if (a.fuelPref === 'open') s += 4;
        if (a.drivingMix === 'highway' || a.drivingMix === 'mixed') s += 15;
        if (a.drivingMix === 'city') s -= 12;
        if (a.drivingMix === 'offroad') s -= 5; // soft AWD ok on light unpaved
        if (a.annualKm >= 15000) s += 10;
        if (a.seats === '4-5') s += 8;
        if (a.seats === '6-7') s -= 35;
        if (a.towing === 'light') s += 12; if (a.towing === 'heavy') s += 8;
        if (a.climate === 'cold' || a.climate === 'mountain') s += 8;
        if (a.drivePref === 'awd' || a.drivePref === 'open') s += 6;
        if (a.childSeats >= 2) s += 6;
        return s;
      },
    },
    {
      id: 'mid-suv-hybrid',
      name: 'Mid-size Hybrid SUV',
      desc: 'Sweet spot for low-stress family life: full hybrid is bulletproof, sips in city, no plug needed.',
      body: 'suv', fuels: ['hev'], drive: 'fwd',
      seats: 5, engineCC: 2500,
      examples: ['Toyota RAV4 Hybrid', 'Honda CR-V e:HEV', 'Lexus NX 350h', 'Hyundai Tucson HEV', 'Kia Sportage HEV'],
      pros: ['5–6 L/100 city', 'No charging needed', 'Toyota/Honda hybrids extremely reliable'],
      cons: ['Cost more new than petrol', 'AWD versions add weight', 'Not as efficient on motorway'],
      priceBand: { new: [42000, 60000], nearlyNew: [32000, 48000], used: [18000, 32000], old: [8000, 18000] },
      consumption: { type: 'petrol', value: 5.8 },
      insurance: 'mid', maintenance: 'low', depreciation: 'slow',
      score: (a) => {
        let s = 0;
        if (a.bodyPref === 'suv' || a.bodyPref === 'crossover') s += 24;
        else if (a.bodyPref === 'open') s += 12;
        if (a.fuelPref === 'hev') s += 30; else if (a.fuelPref === 'open' || a.fuelPref === 'mhev') s += 12;
        if (a.fuelPref === 'diesel') s -= 6;
        if (a.drivingMix === 'city' || a.drivingMix === 'mixed') s += 18;
        if (a.drivingMix === 'highway') s += 4;
        if (a.drivingMix === 'offroad') s -= 30;
        if (a.seats === '4-5') s += 10;
        if (a.seats === '6-7') s -= 35;
        if (a.reliability === 'bulletproof') s += 12;
        if (a.childSeats >= 1) s += 5;
        if (a.towing === 'heavy') s -= 12;
        return s;
      },
    },
    {
      id: 'seven-seat-suv',
      name: '7-seat SUV',
      desc: 'Big-family hauler with proper third row. Diesel/PHEV both common.',
      body: 'suv', fuels: ['diesel', 'phev'], drive: 'awd',
      seats: 7, engineCC: 2000,
      examples: ['Skoda Kodiaq', 'Hyundai Santa Fe', 'Kia Sorento', 'VW Tiguan Allspace', 'Peugeot 5008'],
      pros: ['Real third row, not just kids', 'Tows 2 t+', 'Premium feel'],
      cons: ['Expensive to fuel and insure', 'Hard to park', 'Third row eats boot'],
      priceBand: { new: [45000, 70000], nearlyNew: [33000, 52000], used: [15000, 30000], old: [7000, 16000] },
      consumption: { type: 'diesel', value: 7.5 },
      insurance: 'high', maintenance: 'mid', depreciation: 'normal',
      score: (a) => {
        let s = 0;
        if (a.bodyPref === 'suv' || a.bodyPref === 'mpv') s += 22;
        else if (a.bodyPref === 'open') s += 10;
        if (a.seats === '6-7') s += 35;
        if (a.seats === '4-5') s -= 5;
        if (a.seats === 'cargo' || a.seats === '2') s -= 50;
        if (a.fuelPref === 'diesel' || a.fuelPref === 'phev' || a.fuelPref === 'open') s += 12;
        if (a.drivingMix === 'highway' || a.drivingMix === 'mixed') s += 10;
        if (a.drivingMix === 'city') s -= 18;
        if (a.towing === 'light') s += 8; if (a.towing === 'heavy') s += 12;
        if (a.climate === 'cold' || a.climate === 'mountain') s += 6;
        if (a.childSeats >= 2) s += 12;
        return s;
      },
    },
    {
      id: 'mpv-7seat',
      name: '7-seat MPV / Minivan',
      desc: 'Cheaper, more practical and roomier than a 7-seat SUV. Sliding doors are a parent superpower.',
      body: 'mpv', fuels: ['diesel', 'petrol'], drive: 'fwd',
      seats: 7, engineCC: 2000,
      examples: ['VW Touran TDI', 'Ford Galaxy', 'Renault Espace', 'Citroën Grand C4 SpaceTourer', 'Seat Alhambra'],
      pros: ['Massive interior space', 'Sliding doors easy with kids', 'Cheaper used than SUV equivalent'],
      cons: ['Uncool resale', 'Limited new-car options left', 'No AWD typically'],
      priceBand: { new: [32000, 48000], nearlyNew: [22000, 35000], used: [7000, 18000], old: [3500, 9000] },
      consumption: { type: 'diesel', value: 6.8 },
      insurance: 'mid', maintenance: 'mid', depreciation: 'fast',
      score: (a) => {
        let s = 0;
        if (a.bodyPref === 'mpv') s += 35; else if (a.bodyPref === 'open') s += 18;
        if (a.bodyPref === 'suv' || a.bodyPref === 'crossover') s -= 8;
        if (a.seats === '6-7') s += 30;
        if (a.seats === '4-5') s -= 8; if (a.seats === '2') s -= 30;
        if (a.fuelPref === 'diesel' || a.fuelPref === 'petrol' || a.fuelPref === 'open') s += 14;
        if (a.drivingMix === 'highway' || a.drivingMix === 'mixed') s += 8;
        if (a.drivingMix === 'offroad') s -= 35;
        if (a.childSeats >= 2) s += 14;
        if (a.towing === 'heavy') s -= 12;
        return s;
      },
    },
    {
      id: 'urban-bev',
      name: 'Urban BEV',
      desc: 'Tiny EV for short city trips. Cheapest fuel cost on the road.',
      body: 'hatch', fuels: ['bev'], drive: 'fwd',
      seats: 4, engineCC: 0,
      examples: ['Dacia Spring', 'Fiat 500e', 'Renault Zoe', 'VW e-up!', 'Mini Electric'],
      pros: ['~€2/100 km on home charging', '€0 road tax in RO', 'Silent and torquey in traffic'],
      cons: ['100–250 km real range', 'Awkward on long trips', 'Battery degradation worry on used'],
      priceBand: { new: [18000, 32000], nearlyNew: [14000, 24000], used: [7000, 16000], old: [4000, 9000] },
      consumption: { type: 'kwh', value: 16 },
      insurance: 'mid', maintenance: 'low', depreciation: 'very-fast',
      score: (a) => {
        let s = 0;
        if (a.bodyPref === 'hatch' || a.bodyPref === 'open') s += 18;
        if (a.fuelPref === 'bev') s += 30; else if (a.fuelPref === 'open') s += 6;
        if (a.fuelPref === 'diesel' || a.fuelPref === 'petrol') s -= 30;
        if (a.drivingMix === 'city') s += 25;
        if (a.drivingMix === 'mixed') s += 5;
        if (a.drivingMix === 'highway') s -= 25;
        if (a.drivingMix === 'offroad') s -= 50;
        if (a.annualKm <= 15000) s += 10; else if (a.annualKm >= 27500) s -= 20;
        if (a.charging === 'home' || a.charging === 'work') s += 12;
        if (a.charging === 'public') s -= 5;
        if (a.charging === 'none') s -= 50;
        if (a.seats === '6-7' || a.seats === 'cargo') s -= 50;
        if (a.towing !== 'none') s -= 25;
        if (a.climate === 'cold') s -= 6;
        return s;
      },
    },
    {
      id: 'long-range-bev',
      name: 'Long-range BEV',
      desc: 'Practical EV with 400+ km real range. Replaces a daily-driver ICE car if home charging works.',
      body: 'crossover', fuels: ['bev'], drive: 'rwd',
      seats: 5, engineCC: 0,
      examples: ['Tesla Model 3 / Y', 'Hyundai Ioniq 5 / 6', 'Kia EV6', 'VW ID.4', 'Skoda Enyaq', 'BMW i4'],
      pros: ['Cheap "fuel" if home-charged', '€0 road tax', 'Strong residuals (esp. Tesla)'],
      cons: ['€35k+ entry', 'Public charging on road trips adds time', 'Heavy tire wear'],
      priceBand: { new: [40000, 65000], nearlyNew: [30000, 48000], used: [18000, 32000], old: [10000, 20000] },
      consumption: { type: 'kwh', value: 18 },
      insurance: 'mid', maintenance: 'low', depreciation: 'fast',
      score: (a) => {
        let s = 0;
        if (a.bodyPref === 'crossover' || a.bodyPref === 'sedan' || a.bodyPref === 'suv' || a.bodyPref === 'open') s += 20;
        if (a.fuelPref === 'bev') s += 32; else if (a.fuelPref === 'open') s += 8;
        if (a.fuelPref === 'diesel') s -= 22;
        if (a.drivingMix === 'mixed' || a.drivingMix === 'city') s += 15;
        if (a.drivingMix === 'highway' && a.annualKm <= 35000) s += 4;
        if (a.drivingMix === 'highway' && a.annualKm >= 45000) s -= 8;
        if (a.drivingMix === 'offroad') s -= 35;
        if (a.charging === 'home') s += 18;
        if (a.charging === 'work') s += 10;
        if (a.charging === 'public') s -= 8;
        if (a.charging === 'none') s -= 50;
        if (a.seats === '4-5' || a.seats === '2') s += 8;
        if (a.seats === '6-7') s -= 15;
        if (a.towing === 'heavy') s -= 18;
        if (a.climate === 'cold') s -= 4;
        return s;
      },
    },
    {
      id: 'phev-family',
      name: 'PHEV Family Car',
      desc: 'Electric for the daily commute (~50 km), petrol backup for road trips. Only worth it if you charge daily.',
      body: 'suv', fuels: ['phev'], drive: 'awd',
      seats: 5, engineCC: 2000,
      examples: ['Skoda Octavia iV', 'VW Passat GTE', 'Toyota RAV4 PHEV', 'Mitsubishi Outlander PHEV', 'Kia Niro PHEV'],
      pros: ['1–2 L/100 km if charged daily', 'AWD versions common', 'No range anxiety'],
      cons: ['Expensive to buy', 'Heavy = thirsty if you DON\'T plug in', 'Battery wears out around 8–10 yrs'],
      priceBand: { new: [40000, 60000], nearlyNew: [28000, 45000], used: [13000, 25000], old: [6000, 14000] },
      consumption: { type: 'petrol', value: 3.0 },
      insurance: 'mid', maintenance: 'mid', depreciation: 'fast',
      score: (a) => {
        let s = 0;
        if (a.bodyPref === 'suv' || a.bodyPref === 'crossover' || a.bodyPref === 'combi' || a.bodyPref === 'sedan') s += 18;
        else if (a.bodyPref === 'open') s += 10;
        if (a.fuelPref === 'phev') s += 32; else if (a.fuelPref === 'open') s += 8;
        if (a.fuelPref === 'bev') s -= 5;
        if (a.charging === 'home' || a.charging === 'work') s += 18;
        if (a.charging === 'public') s -= 12;
        if (a.charging === 'none') s -= 35;
        if (a.drivingMix === 'mixed') s += 14;
        if (a.drivingMix === 'city') s += 8;
        if (a.drivingMix === 'highway') s -= 6;
        if (a.drivingMix === 'offroad') s -= 30;
        if (a.annualKm <= 20000) s += 8;
        if (a.seats === '4-5') s += 8;
        if (a.seats === '6-7') s -= 25;
        if (a.reliability === 'bulletproof' && a.condition === 'old') s -= 8;
        if (a.childSeats >= 1) s += 4;
        return s;
      },
    },
    {
      id: 'mhev-premium',
      name: 'Mild-Hybrid Premium Sedan',
      desc: 'Premium-brand cruiser with 48V mild-hybrid. Comfort > efficiency play.',
      body: 'sedan', fuels: ['mhev'], drive: 'rwd',
      seats: 5, engineCC: 2000,
      examples: ['BMW 530i MHEV', 'Audi A6 50 TFSI MHEV', 'Mercedes E300 MHEV'],
      pros: ['Quiet, comfortable', 'Smoother stop-start', 'Premium image'],
      cons: ['Pricey new and to maintain', 'Insurance high', 'Premium parts not cheap'],
      priceBand: { new: [55000, 90000], nearlyNew: [38000, 65000], used: [18000, 35000], old: [9000, 18000] },
      consumption: { type: 'petrol', value: 7.5 },
      insurance: 'premium', maintenance: 'premium', depreciation: 'fast',
      score: (a) => {
        let s = 0;
        if (a.bodyPref === 'sedan' || a.bodyPref === 'combi') s += 22;
        else if (a.bodyPref === 'open') s += 6;
        if (a.fuelPref === 'mhev' || a.fuelPref === 'petrol' || a.fuelPref === 'open') s += 14;
        if (a.fuelPref === 'diesel') s -= 5;
        if (a.drivingMix === 'highway' || a.drivingMix === 'mixed') s += 12;
        if (a.drivingMix === 'city') s -= 5;
        if (a.drivingMix === 'offroad') s -= 40;
        if (a.reliability === 'fun') s += 10;
        if (a.reliability === 'bulletproof') s -= 8;
        if (a.seats === '4-5' || a.seats === '2') s += 6;
        if (a.seats === '6-7' || a.seats === 'cargo') s -= 50;
        if (a.towing === 'heavy') s -= 15;
        return s;
      },
    },
    {
      id: 'lpg-petrol-runabout',
      name: 'LPG Bi-Fuel Runabout',
      desc: 'Petrol car with factory or aftermarket LPG. Cheapest € per km of any ICE option in RO.',
      body: 'sedan', fuels: ['lpg'], drive: 'fwd',
      seats: 5, engineCC: 1600,
      examples: ['Dacia Logan/Sandero LPG', 'Dacia Duster LPG', 'Renault Clio LPG (factory bi-fuel)'],
      pros: ['LPG ~50 % cheaper than petrol per km', 'Range from petrol tank when LPG runs out', 'Cheap to buy'],
      cons: ['Smaller boot (LPG tank in spare-wheel well)', 'Some underground parking lots ban LPG', 'Slightly less power on gas'],
      priceBand: { new: [14000, 22000], nearlyNew: [10000, 16000], used: [5000, 11000], old: [2500, 6000] },
      consumption: { type: 'lpg', value: 8.0 },
      insurance: 'low', maintenance: 'low', depreciation: 'normal',
      score: (a) => {
        let s = 0;
        if (a.bodyPref === 'sedan' || a.bodyPref === 'hatch' || a.bodyPref === 'crossover' || a.bodyPref === 'open') s += 16;
        if (a.fuelPref === 'lpg') s += 35; else if (a.fuelPref === 'petrol' || a.fuelPref === 'open') s += 12;
        if (a.fuelPref === 'bev' || a.fuelPref === 'phev') s -= 15;
        if (a.drivingMix === 'mixed' || a.drivingMix === 'city') s += 10;
        if (a.drivingMix === 'highway') s += 6;
        if (a.drivingMix === 'offroad') s -= 35;
        if (a.annualKm >= 15000) s += 10;
        if (a.reliability === 'bulletproof') s += 6;
        if (a.seats === '6-7' || a.seats === 'cargo') s -= 35;
        if (a.towing === 'heavy') s -= 12;
        return s;
      },
    },
    {
      id: 'offroad-4x4',
      name: 'Body-on-Frame 4x4',
      desc: 'Real off-roader: low-range transfer case, locking diffs, ladder frame. Trades comfort for capability.',
      body: 'suv', fuels: ['diesel'], drive: '4x4',
      seats: 5, engineCC: 3000,
      examples: ['Toyota Land Cruiser', 'Jeep Wrangler', 'Land Rover Defender', 'Suzuki Jimny (mini)', 'Mitsubishi Pajero'],
      pros: ['Goes anywhere', 'Holds value extremely well', 'Tows heavy'],
      cons: ['10–13 L/100 km', 'Crashy on tarmac', 'Expensive insurance, slow on highway'],
      priceBand: { new: [55000, 110000], nearlyNew: [42000, 80000], used: [18000, 45000], old: [8000, 22000] },
      consumption: { type: 'diesel', value: 11 },
      insurance: 'high', maintenance: 'mid', depreciation: 'very-slow',
      score: (a) => {
        let s = 0;
        if (a.bodyPref === 'suv' || a.bodyPref === 'open') s += 18;
        if (a.drivingMix === 'offroad') s += 45;
        if (a.drivingMix === 'mixed') s += 4;
        if (a.drivingMix === 'highway') s -= 8;
        if (a.drivingMix === 'city') s -= 18;
        if (a.drivePref === '4x4') s += 25; else if (a.drivePref === 'awd') s += 8;
        if (a.fuelPref === 'diesel' || a.fuelPref === 'open') s += 12;
        if (a.fuelPref === 'bev' || a.fuelPref === 'hev') s -= 25;
        if (a.climate === 'mountain') s += 12;
        if (a.towing === 'heavy') s += 14;
        if (a.seats === '6-7') s -= 12;
        if (a.reliability === 'bulletproof') s += 6;
        return s;
      },
    },
    {
      id: 'pickup-workhorse',
      name: 'Pickup Workhorse',
      desc: 'Double-cab pickup: 5 seats + open cargo bed. Good for trades, towing, rural use.',
      body: 'pickup', fuels: ['diesel'], drive: '4x4',
      seats: 5, engineCC: 2500,
      examples: ['Toyota Hilux', 'Ford Ranger', 'VW Amarok', 'Mitsubishi L200', 'Isuzu D-Max'],
      pros: ['Open bed for any cargo', 'Tows 3 t', 'Robust frame, lasts forever'],
      cons: ['9–11 L/100 km', 'Awkward in cities', 'Insurance + road tax steep'],
      priceBand: { new: [40000, 65000], nearlyNew: [30000, 48000], used: [12000, 28000], old: [6000, 14000] },
      consumption: { type: 'diesel', value: 9.5 },
      insurance: 'high', maintenance: 'mid', depreciation: 'slow',
      score: (a) => {
        let s = 0;
        if (a.bodyPref === 'pickup') s += 38; else if (a.bodyPref === 'open') s += 8;
        if (a.seats === 'cargo') s += 30;
        if (a.seats === '6-7') s -= 25;
        if (a.fuelPref === 'diesel' || a.fuelPref === 'open') s += 12;
        if (a.fuelPref === 'bev' || a.fuelPref === 'hev') s -= 30;
        if (a.drivingMix === 'offroad') s += 18;
        if (a.drivingMix === 'mixed') s += 4;
        if (a.drivingMix === 'city') s -= 18;
        if (a.towing === 'light') s += 10; if (a.towing === 'heavy') s += 18;
        if (a.drivePref === '4x4' || a.drivePref === 'awd') s += 10;
        if (a.climate === 'mountain') s += 6;
        return s;
      },
    },
    {
      id: 'cargo-van',
      name: 'Cargo Van',
      desc: 'Panel van for trades and small business. Maximum load, minimum frills.',
      body: 'van', fuels: ['diesel'], drive: 'fwd',
      seats: 3, engineCC: 2000,
      examples: ['VW Transporter', 'Mercedes Vito', 'Ford Transit', 'Renault Trafic', 'Fiat Ducato'],
      pros: ['Huge cargo volume', 'Tax-deductible if registered as commercial', 'Cheap parts'],
      cons: ['Drives like a truck', 'No frills', 'Resale soft except VW/Mercedes'],
      priceBand: { new: [28000, 45000], nearlyNew: [20000, 32000], used: [7000, 16000], old: [3000, 9000] },
      consumption: { type: 'diesel', value: 8.5 },
      insurance: 'mid', maintenance: 'mid', depreciation: 'normal',
      score: (a) => {
        let s = 0;
        if (a.bodyPref === 'van') s += 40; else if (a.bodyPref === 'open' && a.seats === 'cargo') s += 18;
        if (a.seats === 'cargo') s += 30;
        if (a.seats === '6-7') s -= 35;
        if (a.seats === '4-5') s -= 25;
        if (a.fuelPref === 'diesel' || a.fuelPref === 'open') s += 14;
        if (a.fuelPref === 'bev') s -= 20;
        if (a.drivingMix === 'mixed' || a.drivingMix === 'highway') s += 10;
        if (a.drivingMix === 'offroad') s -= 25;
        if (a.towing === 'light') s += 5;
        return s;
      },
    },
    {
      id: 'sports-coupe',
      name: 'Sports Coupe',
      desc: 'Toy-grade weekend car. Two-door, RWD or AWD, focus on driving feel.',
      body: 'coupe', fuels: ['petrol'], drive: 'rwd',
      seats: 4, engineCC: 3000,
      examples: ['BMW M2', 'Porsche Cayman', 'Audi RS3', 'Toyota GR Supra', 'Subaru BRZ'],
      pros: ['Fun to drive', 'Holds value if iconic', 'Special-occasion factor'],
      cons: ['Impractical', 'High fuel use, insurance, tires', 'Not a daily for families'],
      priceBand: { new: [55000, 110000], nearlyNew: [40000, 80000], used: [18000, 45000], old: [10000, 22000] },
      consumption: { type: 'petrol', value: 9.5 },
      insurance: 'premium', maintenance: 'premium', depreciation: 'fast',
      score: (a) => {
        let s = 0;
        if (a.bodyPref === 'coupe') s += 40; else if (a.bodyPref === 'open') s += 6;
        if (a.fuelPref === 'petrol' || a.fuelPref === 'open') s += 12;
        if (a.fuelPref === 'bev' || a.fuelPref === 'hev' || a.fuelPref === 'phev') s -= 25;
        if (a.reliability === 'fun') s += 22;
        if (a.reliability === 'bulletproof') s -= 18;
        if (a.seats === '2' || a.seats === '4-5') s += 4;
        if (a.seats === '6-7' || a.seats === 'cargo') s -= 50;
        if (a.childSeats >= 2) s -= 25;
        if (a.drivingMix === 'highway' || a.drivingMix === 'mixed') s += 4;
        if (a.drivingMix === 'offroad') s -= 50;
        if (a.drivePref === 'rwd' || a.drivePref === 'awd' || a.drivePref === 'open') s += 8;
        return s;
      },
    },
    {
      id: 'cabrio',
      name: 'Cabrio / Roadster',
      desc: 'Drop-top weekend car. Light, slow-ish, addictive on a sunny mountain road.',
      body: 'cabrio', fuels: ['petrol'], drive: 'rwd',
      seats: 2, engineCC: 2000,
      examples: ['Mazda MX-5', 'BMW Z4', 'Audi A5 Cabriolet', 'Mini Convertible', 'Porsche Boxster'],
      pros: ['Sun + open air = soul', 'MX-5 is one of the best chassis under €30k', 'Light = cheap to fuel'],
      cons: ['Useless in winter', 'Tiny boot, small cabin', 'Soft top wears + leaks with age'],
      priceBand: { new: [35000, 75000], nearlyNew: [25000, 55000], used: [9000, 25000], old: [4000, 12000] },
      consumption: { type: 'petrol', value: 7.5 },
      insurance: 'high', maintenance: 'mid', depreciation: 'slow',
      score: (a) => {
        let s = 0;
        if (a.bodyPref === 'cabrio') s += 45;
        else if (a.bodyPref === 'open') s += 4;
        if (a.fuelPref === 'petrol' || a.fuelPref === 'open') s += 12;
        if (a.reliability === 'fun') s += 18;
        if (a.reliability === 'bulletproof') s -= 12;
        if (a.seats === '2') s += 12;
        if (a.seats === '4-5') s -= 15;
        if (a.seats === '6-7' || a.seats === 'cargo') s -= 60;
        if (a.childSeats >= 1) s -= 15;
        if (a.climate === 'cold') s -= 10; if (a.climate === 'mild' || a.climate === 'hot') s += 6;
        if (a.drivingMix === 'offroad') s -= 60;
        if (a.towing !== 'none') s -= 30;
        return s;
      },
    },
  ];

  // ---------- real European-market cars ----------
  // Each entry maps to one or more archetype IDs. variants list the most
  // common European trims (engine, fuel, hp, WLTP cons L/100km or kWh/100km, CO2 g/km).
  // euroClass: 'Euro 5' | 'Euro 6b' | 'Euro 6d-temp' | 'Euro 6d' | 'Euro 7' | 'EV'
  // lezAccess: 'eu-wide' (Euro 6d/EV — passes all current LEZs)
  //          | 'restricted' (Euro 6b — fine in most, restricted in Paris central/Brussels strict)
  //          | 'banned-major' (Euro 5 diesel — banned in Berlin/London ULEZ/Paris central/Madrid)
  //          | 'ev' (EV, exempt everywhere)
  // reliability: 1–5; ncap: 0 if not tested under current protocols.
  const MODELS = [];

  // ---- City hatches ----
  MODELS.push(
    {
      id: 'vw-polo-mk6', archetypes: ['city-petrol-hatch'],
      name: 'Volkswagen Polo Mk6', years: '2017–present', body: 'hatch',
      variants: [
        { name: '1.0 MPI 80hp', fuel: 'petrol', cons: 5.6, co2: 128, hp: 80, gearbox: 'manual' },
        { name: '1.0 TSI 95hp', fuel: 'petrol', cons: 5.4, co2: 124, hp: 95, gearbox: 'manual' },
        { name: '1.0 TSI 115hp DSG', fuel: 'petrol', cons: 5.5, co2: 126, hp: 115, gearbox: 'dsg' },
      ],
      priceUsedEUR: [9000, 18000], priceNewEUR: [19000, 27000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: 'Refined, solid build, strong resale across the EU.',
      weaknesses: 'DSG hesitation in stop-go; 1.0 TSI timing chain on early 2017–18 builds.',
    },
    {
      id: 'toyota-yaris-mk4', archetypes: ['city-petrol-hatch'],
      name: 'Toyota Yaris Mk4 (Hybrid)', years: '2020–present', body: 'hatch',
      variants: [
        { name: '1.5 Hybrid 116hp', fuel: 'hev', cons: 4.0, co2: 92, hp: 116, gearbox: 'cvt' },
        { name: '1.5 VVT-i 125hp', fuel: 'petrol', cons: 5.7, co2: 130, hp: 125, gearbox: 'manual' },
      ],
      priceUsedEUR: [13000, 22000], priceNewEUR: [22000, 30000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 5,
      strengths: 'Hybrid is bulletproof and sips ~4 L/100 km in city; cheapest TCO in segment.',
      weaknesses: 'Tight rear seat; petrol resale weaker than hybrid.',
    },
    {
      id: 'skoda-fabia-mk4', archetypes: ['city-petrol-hatch'],
      name: 'Skoda Fabia Mk4', years: '2021–present', body: 'hatch',
      variants: [
        { name: '1.0 MPI 80hp', fuel: 'petrol', cons: 5.6, co2: 127, hp: 80, gearbox: 'manual' },
        { name: '1.0 TSI 95hp', fuel: 'petrol', cons: 5.3, co2: 121, hp: 95, gearbox: 'manual' },
        { name: '1.5 TSI 150hp DSG', fuel: 'petrol', cons: 5.6, co2: 128, hp: 150, gearbox: 'dsg' },
      ],
      priceUsedEUR: [12000, 20000], priceNewEUR: [18000, 26000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: 'Largest boot in class (380 L), Polo platform without Polo price.',
      weaknesses: 'Cabin plastics feel cheaper than Polo; DSG service every 60k km.',
    },
    {
      id: 'renault-clio-v', archetypes: ['city-petrol-hatch', 'lpg-petrol-runabout'],
      name: 'Renault Clio V', years: '2019–present', body: 'hatch',
      variants: [
        { name: 'TCe 90 / 100', fuel: 'petrol', cons: 5.5, co2: 125, hp: 90, gearbox: 'manual' },
        { name: 'E-Tech Hybrid 145', fuel: 'hev', cons: 4.3, co2: 96, hp: 145, gearbox: 'auto' },
        { name: 'TCe 100 LPG', fuel: 'lpg', cons: 7.0, co2: 110, hp: 100, gearbox: 'manual' },
      ],
      priceUsedEUR: [9000, 17000], priceNewEUR: [17000, 26000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 3,
      strengths: 'Bi-fuel LPG version cuts running costs ~50%; classy interior.',
      weaknesses: 'E-Tech gearbox quirky; some 1.0 TCe oil consumption complaints.',
    },
    {
      id: 'dacia-sandero-mk3', archetypes: ['city-petrol-hatch', 'lpg-petrol-runabout'],
      name: 'Dacia Sandero Mk3', years: '2020–present', body: 'hatch',
      variants: [
        { name: 'SCe 65 / 75', fuel: 'petrol', cons: 5.7, co2: 130, hp: 65, gearbox: 'manual' },
        { name: 'TCe 90', fuel: 'petrol', cons: 5.5, co2: 125, hp: 90, gearbox: 'manual' },
        { name: 'TCe 100 ECO-G LPG', fuel: 'lpg', cons: 7.0, co2: 113, hp: 100, gearbox: 'manual' },
      ],
      priceUsedEUR: [7000, 13000], priceNewEUR: [12000, 18000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 2, reliability: 4,
      strengths: 'Cheapest new car in EU; LPG version has the lowest € / km of any ICE.',
      weaknesses: 'Euro NCAP only 2 stars (no AEB on base trims); base interior is basic.',
    },
    {
      id: 'peugeot-208-ii', archetypes: ['city-petrol-hatch', 'urban-bev'],
      name: 'Peugeot 208 II / e-208', years: '2019–present', body: 'hatch',
      variants: [
        { name: 'PureTech 100', fuel: 'petrol', cons: 5.4, co2: 122, hp: 100, gearbox: 'manual' },
        { name: 'PureTech 130 EAT8', fuel: 'petrol', cons: 5.6, co2: 127, hp: 130, gearbox: 'auto' },
        { name: 'e-208 50 kWh', fuel: 'bev', cons: 16.0, co2: 0, hp: 136, gearbox: 'single' },
      ],
      priceUsedEUR: [11000, 22000], priceNewEUR: [21000, 35000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 4, reliability: 3,
      strengths: 'Striking design, e-208 has decent ~340 km real range.',
      weaknesses: 'PureTech 1.2 wet timing belt — replace at 100k km, expensive if neglected.',
    }
  );

  // ---- Highway / family diesel sedans + combis ----
  MODELS.push(
    {
      id: 'vw-passat-b8', archetypes: ['highway-diesel-sedan', 'family-combi-diesel', 'family-combi-petrol', 'phev-family'],
      name: 'VW Passat B8 (Variant)', years: '2014–2023', body: 'combi',
      variants: [
        { name: '2.0 TDI 150hp', fuel: 'diesel', cons: 5.4, co2: 142, hp: 150, gearbox: 'manual/dsg' },
        { name: '2.0 TDI 190hp DSG', fuel: 'diesel', cons: 5.6, co2: 147, hp: 190, gearbox: 'dsg' },
        { name: '1.5 TSI 150hp', fuel: 'petrol', cons: 6.5, co2: 148, hp: 150, gearbox: 'manual' },
        { name: 'GTE PHEV', fuel: 'phev', cons: 1.6, co2: 36, hp: 218, gearbox: 'dsg' },
      ],
      priceUsedEUR: [9000, 22000], priceNewEUR: null,
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 3,
      strengths: 'Highway weapon, 1000+ km tank range on TDI; massive boot.',
      weaknesses: 'AdBlue/EGR maintenance; DSG mechatronic faults pre-2018 (DQ381 update).',
    },
    {
      id: 'skoda-superb-iii', archetypes: ['highway-diesel-sedan', 'family-combi-diesel', 'family-combi-petrol', 'phev-family'],
      name: 'Skoda Superb III', years: '2015–present', body: 'combi',
      variants: [
        { name: '2.0 TDI 150hp', fuel: 'diesel', cons: 5.2, co2: 137, hp: 150, gearbox: 'manual/dsg' },
        { name: '2.0 TDI 200hp DSG 4x4', fuel: 'diesel', cons: 6.4, co2: 167, hp: 200, gearbox: 'dsg' },
        { name: '1.5 TSI 150hp', fuel: 'petrol', cons: 6.4, co2: 145, hp: 150, gearbox: 'manual' },
        { name: 'iV PHEV 218hp', fuel: 'phev', cons: 1.5, co2: 35, hp: 218, gearbox: 'dsg' },
      ],
      priceUsedEUR: [11000, 28000], priceNewEUR: [38000, 55000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: 'Limo-grade rear room (the EU executive sleeper); 660 L combi boot.',
      weaknesses: 'Same DSG/TDI maintenance as Passat; 2.0 TDI EA288 EGR cooler on early units.',
    },
    {
      id: 'audi-a4-b9', archetypes: ['highway-diesel-sedan', 'mhev-premium'],
      name: 'Audi A4 B9 / B9 PA', years: '2015–present', body: 'sedan',
      variants: [
        { name: '35 TDI 163hp', fuel: 'diesel', cons: 4.9, co2: 128, hp: 163, gearbox: 'auto' },
        { name: '40 TDI 204hp quattro', fuel: 'diesel', cons: 5.4, co2: 142, hp: 204, gearbox: 'auto' },
        { name: '40 TFSI 204hp MHEV', fuel: 'mhev', cons: 6.5, co2: 148, hp: 204, gearbox: 'auto' },
      ],
      priceUsedEUR: [13000, 32000], priceNewEUR: [48000, 65000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 3,
      strengths: 'Premium feel, quattro AWD on diesel, holds value better than 3-Series.',
      weaknesses: 'S tronic gearbox pricey to repair; expensive parts (€600+ brake jobs).',
    },
    {
      id: 'bmw-3-g20', archetypes: ['highway-diesel-sedan', 'mhev-premium'],
      name: 'BMW 3 Series G20', years: '2019–present', body: 'sedan',
      variants: [
        { name: '320d 190hp MHEV', fuel: 'diesel', cons: 4.6, co2: 121, hp: 190, gearbox: 'auto' },
        { name: '330e PHEV 292hp', fuel: 'phev', cons: 1.7, co2: 39, hp: 292, gearbox: 'auto' },
        { name: '330i 245hp', fuel: 'petrol', cons: 6.5, co2: 148, hp: 245, gearbox: 'auto' },
      ],
      priceUsedEUR: [22000, 42000], priceNewEUR: [50000, 68000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: 'Best-driving sedan in segment; 320d is one of the most efficient diesels in EU.',
      weaknesses: 'Run-flat tires harsh on broken roads; expensive ZF8 service if you skip it.',
    },
    {
      id: 'mercedes-c-w205', archetypes: ['highway-diesel-sedan', 'mhev-premium'],
      name: 'Mercedes C-Class W205 / W206', years: '2014–present', body: 'sedan',
      variants: [
        { name: 'C 220d 200hp', fuel: 'diesel', cons: 4.7, co2: 124, hp: 200, gearbox: 'auto' },
        { name: 'C 300de PHEV 306hp', fuel: 'phev', cons: 1.6, co2: 37, hp: 306, gearbox: 'auto' },
        { name: 'C 200 MHEV 204hp', fuel: 'mhev', cons: 6.5, co2: 148, hp: 204, gearbox: 'auto' },
      ],
      priceUsedEUR: [14000, 38000], priceNewEUR: [55000, 75000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 3,
      strengths: 'Comfortable highway cruiser; OM654 diesel meets Euro 6d cleanly.',
      weaknesses: 'W205 air suspension expensive to repair; some W206 software gremlins.',
    },
    {
      id: 'volvo-s60-v60', archetypes: ['highway-diesel-sedan', 'family-combi-diesel', 'mhev-premium'],
      name: 'Volvo S60 / V60 III', years: '2018–present', body: 'combi',
      variants: [
        { name: 'B4 MHEV 197hp', fuel: 'mhev', cons: 6.7, co2: 152, hp: 197, gearbox: 'auto' },
        { name: 'B5 MHEV 250hp AWD', fuel: 'mhev', cons: 7.5, co2: 170, hp: 250, gearbox: 'auto' },
        { name: 'T6 Recharge PHEV 350hp', fuel: 'phev', cons: 1.7, co2: 38, hp: 350, gearbox: 'auto' },
      ],
      priceUsedEUR: [18000, 38000], priceNewEUR: [50000, 68000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: 'Class-leading safety; comfortable seats; PHEV gets >50 km real EV range.',
      weaknesses: 'Diesel option dropped after 2020; Sensus infotainment can lag.',
    }
  );

  // ---- Compact petrol sedan / Dacia ----
  MODELS.push(
    {
      id: 'skoda-octavia-mk4-sedan', archetypes: ['compact-petrol-sedan', 'family-combi-diesel', 'family-combi-petrol', 'phev-family'],
      name: 'Skoda Octavia Mk4 (Sedan + Combi)', years: '2020–present', body: 'sedan',
      variants: [
        { name: '1.0 TSI 110hp', fuel: 'petrol', cons: 5.4, co2: 122, hp: 110, gearbox: 'manual' },
        { name: '1.5 TSI 150hp', fuel: 'petrol', cons: 5.7, co2: 130, hp: 150, gearbox: 'manual/dsg' },
        { name: '2.0 TDI 150hp', fuel: 'diesel', cons: 4.6, co2: 121, hp: 150, gearbox: 'manual/dsg' },
        { name: 'iV PHEV 204hp', fuel: 'phev', cons: 1.4, co2: 32, hp: 204, gearbox: 'dsg' },
      ],
      priceUsedEUR: [16000, 28000], priceNewEUR: [26000, 42000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: 'The default sensible EU family car: huge boot, refined, every drivetrain available.',
      weaknesses: '1.5 TSI ACT cylinder-deactivation can clatter; touch-only climate controls.',
    },
    {
      id: 'dacia-logan-mk3', archetypes: ['compact-petrol-sedan', 'lpg-petrol-runabout'],
      name: 'Dacia Logan III', years: '2020–present', body: 'sedan',
      variants: [
        { name: 'SCe 65', fuel: 'petrol', cons: 5.7, co2: 130, hp: 65, gearbox: 'manual' },
        { name: 'TCe 90', fuel: 'petrol', cons: 5.5, co2: 125, hp: 90, gearbox: 'manual' },
        { name: 'TCe 100 ECO-G LPG', fuel: 'lpg', cons: 7.0, co2: 113, hp: 100, gearbox: 'manual' },
      ],
      priceUsedEUR: [7000, 13000], priceNewEUR: [13000, 19000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 2, reliability: 4,
      strengths: 'Cheap to buy and run; 510 L boot; LPG version 30–50 % cheaper per km.',
      weaknesses: 'Euro NCAP 2★ (no AEB on base); base trim feels exactly like its price.',
    },
    {
      id: 'toyota-corolla-sedan', archetypes: ['compact-petrol-sedan', 'family-combi-petrol'],
      name: 'Toyota Corolla E210 (Sedan + TS Combi)', years: '2018–present', body: 'sedan',
      variants: [
        { name: '1.8 Hybrid 140hp', fuel: 'hev', cons: 4.3, co2: 99, hp: 140, gearbox: 'cvt' },
        { name: '2.0 Hybrid 196hp', fuel: 'hev', cons: 4.5, co2: 104, hp: 196, gearbox: 'cvt' },
      ],
      priceUsedEUR: [15000, 26000], priceNewEUR: [27000, 36000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 5,
      strengths: 'Two-decade Toyota hybrid reliability; cheapest TCO over 5 years in segment.',
      weaknesses: 'CVT droning under load; no real diesel or petrol-only option in EU.',
    }
  );

  // ---- Family combi petrol + compact crossover ----
  MODELS.push(
    {
      id: 'opel-astra-k-st', archetypes: ['family-combi-petrol', 'family-combi-diesel'],
      name: 'Opel Astra K Sports Tourer', years: '2015–2021', body: 'combi',
      variants: [
        { name: '1.2 Turbo 130hp', fuel: 'petrol', cons: 5.6, co2: 128, hp: 130, gearbox: 'manual' },
        { name: '1.5 CDTI 122hp', fuel: 'diesel', cons: 4.4, co2: 116, hp: 122, gearbox: 'manual' },
      ],
      priceUsedEUR: [7000, 16000], priceNewEUR: null,
      euroClass: 'Euro 6d-temp', lezAccess: 'eu-wide', ncap: 5, reliability: 3,
      strengths: 'Light (1300 kg), efficient, big 1630 L boot; cheap on the used market.',
      weaknesses: 'Some 1.4T timing chain stretching; PSA-era 1.5 CDTI on late builds is the keeper.',
    },
    {
      id: 'peugeot-308-sw', archetypes: ['family-combi-petrol', 'family-combi-diesel', 'phev-family'],
      name: 'Peugeot 308 SW (II / III)', years: '2014–present', body: 'combi',
      variants: [
        { name: 'PureTech 130 / 1.2 EAT8', fuel: 'petrol', cons: 5.7, co2: 130, hp: 130, gearbox: 'auto' },
        { name: 'BlueHDi 130', fuel: 'diesel', cons: 4.5, co2: 118, hp: 130, gearbox: 'manual' },
        { name: 'Hybrid 180 PHEV', fuel: 'phev', cons: 1.3, co2: 30, hp: 180, gearbox: 'auto' },
      ],
      priceUsedEUR: [10000, 24000], priceNewEUR: [33000, 45000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 3,
      strengths: 'Cabin feels premium; BlueHDi diesel cleanest in class for Crit\'Air access.',
      weaknesses: 'PureTech wet timing belt — replace at 100k km; tiny i-Cockpit wheel divides opinion.',
    },
    {
      id: 'vw-golf-mk8-variant', archetypes: ['family-combi-petrol', 'family-combi-diesel', 'phev-family'],
      name: 'VW Golf Mk8 / Variant', years: '2020–present', body: 'combi',
      variants: [
        { name: '1.5 TSI 130 / 150hp', fuel: 'petrol', cons: 5.7, co2: 130, hp: 150, gearbox: 'manual/dsg' },
        { name: '2.0 TDI 115 / 150hp', fuel: 'diesel', cons: 4.5, co2: 118, hp: 150, gearbox: 'manual/dsg' },
        { name: 'eHybrid 204hp PHEV', fuel: 'phev', cons: 1.3, co2: 31, hp: 204, gearbox: 'dsg' },
      ],
      priceUsedEUR: [16000, 30000], priceNewEUR: [29000, 45000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 3,
      strengths: 'Refined, plenty of drivetrains; Variant has 611 L boot.',
      weaknesses: 'Mk8 infotainment buggy at launch (improved 2023+); same DSG/TDI maintenance.',
    },
    {
      id: 'vw-t-roc', archetypes: ['compact-crossover-petrol'],
      name: 'VW T-Roc', years: '2017–present', body: 'crossover',
      variants: [
        { name: '1.0 TSI 110hp', fuel: 'petrol', cons: 5.7, co2: 130, hp: 110, gearbox: 'manual' },
        { name: '1.5 TSI 150hp', fuel: 'petrol', cons: 6.0, co2: 137, hp: 150, gearbox: 'manual/dsg' },
        { name: '2.0 TDI 150hp 4Motion', fuel: 'diesel', cons: 5.6, co2: 147, hp: 150, gearbox: 'dsg' },
      ],
      priceUsedEUR: [16000, 28000], priceNewEUR: [28000, 40000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 3,
      strengths: 'Strong residuals; refined, mature platform; 4Motion is a real-world AWD.',
      weaknesses: 'Smaller boot than Kamiq; DSG service every 60k km mandatory.',
    },
    {
      id: 'skoda-kamiq', archetypes: ['compact-crossover-petrol'],
      name: 'Skoda Kamiq', years: '2019–present', body: 'crossover',
      variants: [
        { name: '1.0 TSI 95 / 110hp', fuel: 'petrol', cons: 5.5, co2: 125, hp: 110, gearbox: 'manual' },
        { name: '1.5 TSI 150hp DSG', fuel: 'petrol', cons: 5.6, co2: 128, hp: 150, gearbox: 'dsg' },
      ],
      priceUsedEUR: [15000, 24000], priceNewEUR: [24000, 33000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: 'More boot than T-Roc, less money; same VAG mechanicals.',
      weaknesses: 'No AWD or diesel option in EU; high-speed road noise.',
    },
    {
      id: 'hyundai-kona', archetypes: ['compact-crossover-petrol', 'urban-bev', 'long-range-bev'],
      name: 'Hyundai Kona (II)', years: '2017–present', body: 'crossover',
      variants: [
        { name: '1.0 T-GDi 120hp', fuel: 'petrol', cons: 5.9, co2: 134, hp: 120, gearbox: 'manual' },
        { name: '1.6 T-GDi Hybrid 141hp', fuel: 'hev', cons: 4.7, co2: 107, hp: 141, gearbox: 'auto' },
        { name: 'Electric 64 kWh', fuel: 'bev', cons: 14.7, co2: 0, hp: 204, gearbox: 'single' },
      ],
      priceUsedEUR: [13000, 28000], priceNewEUR: [25000, 45000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: 'BEV does ~400 km real range — sweet spot for an urban-leaning EV.',
      weaknesses: 'Some 64 kWh battery recall (LG cells, 2017–20); rear visibility tight.',
    },
    {
      id: 'toyota-yaris-cross', archetypes: ['compact-crossover-petrol'],
      name: 'Toyota Yaris Cross', years: '2020–present', body: 'crossover',
      variants: [
        { name: '1.5 Hybrid 116hp', fuel: 'hev', cons: 4.4, co2: 100, hp: 116, gearbox: 'cvt' },
        { name: '1.5 Hybrid AWD-i 116hp', fuel: 'hev', cons: 4.7, co2: 106, hp: 116, gearbox: 'cvt' },
      ],
      priceUsedEUR: [17000, 26000], priceNewEUR: [26000, 35000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 4, reliability: 5,
      strengths: 'Toyota hybrid frugality + light AWD option for snow; 4.5 L/100 real-world.',
      weaknesses: 'Engine noisy under load (CVT); rear seat tight for adults.',
    },
    {
      id: 'ford-puma', archetypes: ['compact-crossover-petrol'],
      name: 'Ford Puma', years: '2019–present', body: 'crossover',
      variants: [
        { name: '1.0 EcoBoost mHEV 125 / 155hp', fuel: 'mhev', cons: 5.5, co2: 125, hp: 155, gearbox: 'manual' },
        { name: 'Puma Electric 200hp', fuel: 'bev', cons: 14.5, co2: 0, hp: 168, gearbox: 'single' },
      ],
      priceUsedEUR: [14000, 24000], priceNewEUR: [27000, 38000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 3,
      strengths: 'Best-driving small crossover; clever 80 L "Megabox" under the boot floor.',
      weaknesses: '1.0 EcoBoost wet belt issues on early units (pre-2018 fix; less in Puma).',
    }
  );

  // ---- Mid-size diesel SUV ----
  MODELS.push(
    {
      id: 'vw-tiguan-mk2', archetypes: ['mid-suv-diesel', 'phev-family'],
      name: 'VW Tiguan Mk2 / Mk3', years: '2016–present', body: 'suv',
      variants: [
        { name: '2.0 TDI 150hp 4Motion', fuel: 'diesel', cons: 5.5, co2: 145, hp: 150, gearbox: 'dsg' },
        { name: '2.0 TDI 200hp DSG 4Motion', fuel: 'diesel', cons: 5.9, co2: 154, hp: 200, gearbox: 'dsg' },
        { name: 'eHybrid PHEV 245hp', fuel: 'phev', cons: 1.5, co2: 35, hp: 245, gearbox: 'dsg' },
      ],
      priceUsedEUR: [15000, 35000], priceNewEUR: [40000, 60000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 3,
      strengths: 'Real 4Motion AWD with Haldex; tows 2200 kg; refined long-distance car.',
      weaknesses: 'EA288 EGR cooler issues 2016–18; DSG service mandatory.',
    },
    {
      id: 'hyundai-tucson-nx4', archetypes: ['mid-suv-hybrid', 'phev-family'],
      name: 'Hyundai Tucson NX4', years: '2020–present', body: 'suv',
      variants: [
        { name: '1.6 T-GDi HEV 230hp', fuel: 'hev', cons: 5.7, co2: 130, hp: 230, gearbox: 'auto' },
        { name: '1.6 T-GDi PHEV 265hp', fuel: 'phev', cons: 1.4, co2: 31, hp: 265, gearbox: 'auto' },
      ],
      priceUsedEUR: [22000, 38000], priceNewEUR: [35000, 50000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: '7-year warranty, modern interior, hybrid drivetrains are the keepers.',
      weaknesses: 'Skip the 1.6 CRDi diesel — lethargic and Smartstream complications; PHEV battery recall 2022.',
    },
    {
      id: 'kia-sportage-nq5', archetypes: ['mid-suv-hybrid', 'phev-family'],
      name: 'Kia Sportage NQ5', years: '2021–present', body: 'suv',
      variants: [
        { name: '1.6 T-GDi HEV 230hp', fuel: 'hev', cons: 5.6, co2: 127, hp: 230, gearbox: 'auto' },
        { name: '1.6 T-GDi PHEV 265hp', fuel: 'phev', cons: 1.4, co2: 32, hp: 265, gearbox: 'auto' },
      ],
      priceUsedEUR: [22000, 38000], priceNewEUR: [35000, 50000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: '7-year warranty (EU); identical mechanics to Tucson but slightly cheaper.',
      weaknesses: 'Skip the 1.6 CRDi diesel; same PHEV recall as Tucson.',
    },
    {
      id: 'mazda-cx5', archetypes: ['mid-suv-hybrid'],
      name: 'Mazda CX-5 II', years: '2017–present', body: 'suv',
      variants: [
        { name: '2.0 Skyactiv-G MHEV 165hp', fuel: 'mhev', cons: 6.9, co2: 158, hp: 165, gearbox: 'manual/auto' },
        { name: '2.5 Skyactiv-G MHEV 194hp AWD', fuel: 'mhev', cons: 7.4, co2: 168, hp: 194, gearbox: 'auto' },
      ],
      priceUsedEUR: [16000, 30000], priceNewEUR: [33000, 48000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: 'Drives like a sedan; the petrol Skyactiv-G is naturally aspirated and bulletproof.',
      weaknesses: 'Avoid the 2.2 Skyactiv-D diesel (turbo + DPF issues); no PHEV option.',
    },
    {
      id: 'nissan-x-trail-t33', archetypes: ['mid-suv-hybrid', 'seven-seat-suv'],
      name: 'Nissan X-Trail T33', years: '2022–present', body: 'suv',
      variants: [
        { name: 'e-POWER 204hp', fuel: 'hev', cons: 5.8, co2: 132, hp: 204, gearbox: 'cvt-like' },
        { name: 'e-POWER e-4ORCE 213hp AWD', fuel: 'hev', cons: 6.2, co2: 142, hp: 213, gearbox: 'cvt-like' },
        { name: '1.5 VC-Turbo 163hp MHEV', fuel: 'mhev', cons: 6.7, co2: 152, hp: 163, gearbox: 'cvt' },
      ],
      priceUsedEUR: [25000, 42000], priceNewEUR: [38000, 55000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: 'Optional 7 seats; e-POWER drives like an EV with no plug needed.',
      weaknesses: 'Expensive vs Hyundai/Kia; e-POWER thirsty on motorway.',
    },
    {
      id: 'bmw-x3-g01', archetypes: ['mid-suv-diesel', 'mhev-premium', 'phev-family'],
      name: 'BMW X3 G01 / G45', years: '2017–present', body: 'suv',
      variants: [
        { name: 'xDrive20d 190hp B47 MHEV', fuel: 'diesel', cons: 5.5, co2: 144, hp: 190, gearbox: 'auto' },
        { name: 'xDrive30d 286hp B57 MHEV', fuel: 'diesel', cons: 6.4, co2: 168, hp: 286, gearbox: 'auto' },
        { name: 'xDrive30e PHEV 292hp', fuel: 'phev', cons: 1.9, co2: 43, hp: 292, gearbox: 'auto' },
      ],
      priceUsedEUR: [22000, 50000], priceNewEUR: [60000, 85000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: 'B47 / B57 are among the most refined diesels ever made; xDrive is a real AWD.',
      weaknesses: 'EGR cooler recall on early B47 (2015–17); ZF8 service every 80k km not optional.',
    },
    {
      id: 'mercedes-glc-x253', archetypes: ['mid-suv-diesel', 'mhev-premium', 'phev-family'],
      name: 'Mercedes GLC X253 / X254', years: '2015–present', body: 'suv',
      variants: [
        { name: 'GLC 220d 4MATIC 197hp OM654', fuel: 'diesel', cons: 5.4, co2: 142, hp: 197, gearbox: 'auto' },
        { name: 'GLC 300d 4MATIC 269hp', fuel: 'diesel', cons: 5.7, co2: 150, hp: 269, gearbox: 'auto' },
        { name: 'GLC 300de PHEV 333hp', fuel: 'phev', cons: 1.4, co2: 32, hp: 333, gearbox: 'auto' },
      ],
      priceUsedEUR: [22000, 55000], priceNewEUR: [62000, 90000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: 'OM654 is one of the cleanest, smoothest 2.0 diesels in the EU; quiet, comfortable cruiser.',
      weaknesses: 'AdBlue maintenance pricier than VAG; W253 air suspension expensive long-term.',
    },
    {
      id: 'audi-q5-fy', archetypes: ['mid-suv-diesel', 'mhev-premium', 'phev-family'],
      name: 'Audi Q5 FY', years: '2017–present', body: 'suv',
      variants: [
        { name: '40 TDI quattro 204hp MHEV', fuel: 'diesel', cons: 5.6, co2: 147, hp: 204, gearbox: 'auto' },
        { name: '50 TDI quattro 286hp MHEV', fuel: 'diesel', cons: 6.7, co2: 175, hp: 286, gearbox: 'auto' },
        { name: '55 TFSI e quattro PHEV 367hp', fuel: 'phev', cons: 1.9, co2: 44, hp: 367, gearbox: 'auto' },
      ],
      priceUsedEUR: [22000, 50000], priceNewEUR: [60000, 85000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: 'EA288 evo 2.0 TDI matures well; quattro is genuine AWD; 50 TDI 3.0 V6 is a torquey cruiser.',
      weaknesses: '7-speed S tronic clunky cold; service costs at the dealer get expensive.',
    },
    {
      id: 'volvo-xc60-ii', archetypes: ['mid-suv-diesel', 'mhev-premium', 'phev-family'],
      name: 'Volvo XC60 II', years: '2017–present', body: 'suv',
      variants: [
        { name: 'B4 / B5 MHEV diesel 197 / 235hp', fuel: 'diesel', cons: 5.9, co2: 154, hp: 235, gearbox: 'auto' },
        { name: 'B5 / B6 MHEV petrol 250 / 300hp', fuel: 'mhev', cons: 7.6, co2: 172, hp: 300, gearbox: 'auto' },
        { name: 'T8 Recharge PHEV 455hp', fuel: 'phev', cons: 1.6, co2: 36, hp: 455, gearbox: 'auto' },
      ],
      priceUsedEUR: [22000, 48000], priceNewEUR: [55000, 82000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: 'Class-leading safety; comfortable seats; D5204 diesel matched with 48V is smooth and frugal.',
      weaknesses: 'Diesel dropped from XC60 in 2024; Sensus infotainment is slow.',
    }
  );

  // ---- Hybrid SUV (the Toyota / Honda zone) ----
  MODELS.push(
    {
      id: 'toyota-rav4-v', archetypes: ['mid-suv-hybrid', 'phev-family'],
      name: 'Toyota RAV4 V (Hybrid + PHEV)', years: '2018–present', body: 'suv',
      variants: [
        { name: '2.5 Hybrid 218hp FWD', fuel: 'hev', cons: 5.6, co2: 127, hp: 218, gearbox: 'cvt' },
        { name: '2.5 Hybrid 222hp AWD-i', fuel: 'hev', cons: 6.0, co2: 136, hp: 222, gearbox: 'cvt' },
        { name: '2.5 Plug-in 306hp AWD', fuel: 'phev', cons: 1.0, co2: 22, hp: 306, gearbox: 'cvt' },
      ],
      priceUsedEUR: [25000, 42000], priceNewEUR: [42000, 60000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 5,
      strengths: 'Toyota hybrid bulletproofness scaled to a family SUV; PHEV does ~75 km real EV range.',
      weaknesses: 'CVT droning under acceleration; PHEV depreciation steeper than HEV.',
    },
    {
      id: 'honda-cr-v-vi', archetypes: ['mid-suv-hybrid', 'phev-family'],
      name: 'Honda CR-V VI e:HEV / e:PHEV', years: '2023–present', body: 'suv',
      variants: [
        { name: '2.0 e:HEV 184hp', fuel: 'hev', cons: 6.4, co2: 145, hp: 184, gearbox: 'eCVT' },
        { name: '2.0 e:PHEV 184hp', fuel: 'phev', cons: 0.8, co2: 18, hp: 184, gearbox: 'eCVT' },
      ],
      priceUsedEUR: [32000, 45000], priceNewEUR: [45000, 60000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 5,
      strengths: 'Honda hybrid drivetrain feels closer to an EV than RAV4; refined; spacious.',
      weaknesses: 'No 7-seat option in EU (gone in this gen); pricey for the badge.',
    },
    {
      id: 'lexus-nx-ii', archetypes: ['mid-suv-hybrid', 'phev-family'],
      name: 'Lexus NX II (350h / 450h+)', years: '2021–present', body: 'suv',
      variants: [
        { name: '350h 244hp AWD', fuel: 'hev', cons: 6.0, co2: 138, hp: 244, gearbox: 'cvt' },
        { name: '450h+ PHEV 309hp AWD', fuel: 'phev', cons: 1.2, co2: 26, hp: 309, gearbox: 'cvt' },
      ],
      priceUsedEUR: [38000, 55000], priceNewEUR: [55000, 75000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 5,
      strengths: 'Premium-brand cabin with Toyota hybrid reliability; quiet on the autostrada.',
      weaknesses: 'Expensive new; infotainment finally OK after years of touchpad torture.',
    }
  );

  // ---- 7-seat SUV ----
  MODELS.push(
    {
      id: 'skoda-kodiaq', archetypes: ['seven-seat-suv', 'mid-suv-diesel', 'phev-family'],
      name: 'Skoda Kodiaq I / II', years: '2016–present', body: 'suv',
      variants: [
        { name: '2.0 TDI 150hp 7-seat', fuel: 'diesel', cons: 5.6, co2: 147, hp: 150, gearbox: 'dsg' },
        { name: '2.0 TDI 200hp 4x4 DSG', fuel: 'diesel', cons: 6.5, co2: 170, hp: 200, gearbox: 'dsg' },
        { name: 'iV PHEV 204hp (gen 2)', fuel: 'phev', cons: 1.5, co2: 35, hp: 204, gearbox: 'dsg' },
      ],
      priceUsedEUR: [18000, 38000], priceNewEUR: [42000, 60000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: 'Genuine 7-seater (3rd row fits adults short-haul); Skoda value-for-money.',
      weaknesses: 'Boot tiny with all 7 up (270 L); same EA288/DSG concerns as VAG family.',
    },
    {
      id: 'hyundai-santa-fe', archetypes: ['seven-seat-suv', 'phev-family'],
      name: 'Hyundai Santa Fe IV / V', years: '2018–present', body: 'suv',
      variants: [
        { name: '2.2 CRDi 200hp 8AT', fuel: 'diesel', cons: 6.1, co2: 159, hp: 200, gearbox: 'auto' },
        { name: '1.6 T-GDi HEV 230hp', fuel: 'hev', cons: 6.3, co2: 144, hp: 230, gearbox: 'auto' },
        { name: '1.6 T-GDi PHEV 265hp', fuel: 'phev', cons: 1.7, co2: 39, hp: 265, gearbox: 'auto' },
      ],
      priceUsedEUR: [22000, 42000], priceNewEUR: [45000, 65000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: 'Roomy 3rd row, 7-yr warranty, well-equipped at every trim level.',
      weaknesses: 'Bold styling on V (post-2024) divides; HEV only marginally efficient on motorway.',
    },
    {
      id: 'kia-sorento', archetypes: ['seven-seat-suv', 'phev-family'],
      name: 'Kia Sorento IV', years: '2020–present', body: 'suv',
      variants: [
        { name: '2.2 CRDi 202hp 8DCT', fuel: 'diesel', cons: 6.0, co2: 158, hp: 202, gearbox: 'dct' },
        { name: '1.6 T-GDi HEV 230hp', fuel: 'hev', cons: 6.4, co2: 145, hp: 230, gearbox: 'auto' },
        { name: '1.6 T-GDi PHEV 265hp', fuel: 'phev', cons: 1.6, co2: 38, hp: 265, gearbox: 'auto' },
      ],
      priceUsedEUR: [25000, 45000], priceNewEUR: [48000, 68000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: 'Most upmarket-feeling Korean 7-seater; DCT on diesel is sharp.',
      weaknesses: 'DCT can stutter at low speeds when cold; PHEV battery same recall as Tucson.',
    },
    {
      id: 'peugeot-5008', archetypes: ['seven-seat-suv', 'mpv-7seat'],
      name: 'Peugeot 5008 II', years: '2017–2024', body: 'suv',
      variants: [
        { name: '1.2 PureTech 130hp 8AT', fuel: 'petrol', cons: 6.5, co2: 148, hp: 130, gearbox: 'auto' },
        { name: '1.5 BlueHDi 130hp 8AT', fuel: 'diesel', cons: 4.7, co2: 124, hp: 130, gearbox: 'auto' },
        { name: '1.6 PureTech Hybrid PHEV', fuel: 'phev', cons: 1.4, co2: 32, hp: 225, gearbox: 'auto' },
      ],
      priceUsedEUR: [16000, 32000], priceNewEUR: null,
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 4, reliability: 3,
      strengths: 'Stylish; 7 seats from a compact footprint; massive boot if you fold rear two.',
      weaknesses: 'PureTech wet belt rule applies; rearmost row strictly child-sized.',
    },
    {
      id: 'vw-tiguan-allspace', archetypes: ['seven-seat-suv'],
      name: 'VW Tiguan Allspace', years: '2017–2024', body: 'suv',
      variants: [
        { name: '2.0 TDI 150hp 4Motion', fuel: 'diesel', cons: 5.7, co2: 150, hp: 150, gearbox: 'dsg' },
        { name: '2.0 TDI 200hp DSG 4Motion', fuel: 'diesel', cons: 6.0, co2: 158, hp: 200, gearbox: 'dsg' },
      ],
      priceUsedEUR: [20000, 38000], priceNewEUR: null,
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 3,
      strengths: 'VW build with the longer wheelbase; tows 2500 kg.',
      weaknesses: 'Discontinued 2024 — no new units; same TDI/DSG service notes.',
    }
  );

  // ---- 7-seat MPV ----
  MODELS.push(
    {
      id: 'vw-touran-iii', archetypes: ['mpv-7seat'],
      name: 'VW Touran III', years: '2015–present', body: 'mpv',
      variants: [
        { name: '2.0 TDI 122 / 150hp', fuel: 'diesel', cons: 5.0, co2: 131, hp: 150, gearbox: 'manual/dsg' },
        { name: '1.5 TSI 150hp', fuel: 'petrol', cons: 6.5, co2: 148, hp: 150, gearbox: 'manual/dsg' },
      ],
      priceUsedEUR: [12000, 25000], priceNewEUR: [37000, 48000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: 'Properly modular 7 seats — all 5 rear seats fold flat individually.',
      weaknesses: 'Dated cabin; same TDI/DSG service profile as Passat.',
    },
    {
      id: 'ford-galaxy-iv', archetypes: ['mpv-7seat'],
      name: 'Ford Galaxy IV / S-Max', years: '2015–2023', body: 'mpv',
      variants: [
        { name: '2.0 EcoBlue 150 / 190hp', fuel: 'diesel', cons: 5.7, co2: 149, hp: 190, gearbox: 'manual/auto' },
        { name: '2.5 Duratec Hybrid 190hp', fuel: 'hev', cons: 5.9, co2: 134, hp: 190, gearbox: 'cvt' },
      ],
      priceUsedEUR: [10000, 22000], priceNewEUR: null,
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 3,
      strengths: 'Limo-grade rear room; Hybrid version is cheap to run for a 1.8 t car.',
      weaknesses: 'Discontinued in EU 2023; AdBlue tank consumption higher than VAG.',
    },
    {
      id: 'renault-espace-vi', archetypes: ['mpv-7seat', 'seven-seat-suv'],
      name: 'Renault Espace VI', years: '2023–present', body: 'mpv',
      variants: [
        { name: 'E-Tech Full Hybrid 200hp', fuel: 'hev', cons: 4.8, co2: 109, hp: 200, gearbox: 'auto' },
      ],
      priceUsedEUR: [32000, 48000], priceNewEUR: [42000, 55000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 4, reliability: 3,
      strengths: '4.8 L/100 from a 7-seater is exceptional; sliding 2nd row.',
      weaknesses: 'Expensive new; 3rd row strictly child-sized; gen-1 E-Tech multi-mode quirky.',
    },
    {
      id: 'citroen-grand-c4', archetypes: ['mpv-7seat'],
      name: 'Citroën Grand C4 SpaceTourer', years: '2013–2022', body: 'mpv',
      variants: [
        { name: '1.5 BlueHDi 130hp', fuel: 'diesel', cons: 4.5, co2: 119, hp: 130, gearbox: 'manual/auto' },
        { name: '1.2 PureTech 130hp EAT8', fuel: 'petrol', cons: 6.0, co2: 137, hp: 130, gearbox: 'auto' },
      ],
      priceUsedEUR: [8000, 17000], priceNewEUR: null,
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 3,
      strengths: 'Best value used 7-seater (huge inside, cheap to buy); BlueHDi is frugal.',
      weaknesses: 'Discontinued; PureTech wet-belt rule; soft suspension wallows on B-roads.',
    },
    {
      id: 'seat-alhambra-ii', archetypes: ['mpv-7seat'],
      name: 'Seat Alhambra II', years: '2010–2020', body: 'mpv',
      variants: [
        { name: '2.0 TDI 150 / 184hp', fuel: 'diesel', cons: 5.8, co2: 152, hp: 184, gearbox: 'manual/dsg' },
        { name: '1.4 TSI 150hp', fuel: 'petrol', cons: 6.9, co2: 159, hp: 150, gearbox: 'manual/dsg' },
      ],
      priceUsedEUR: [7000, 18000], priceNewEUR: null,
      euroClass: 'Euro 6b', lezAccess: 'restricted', ncap: 5, reliability: 4,
      strengths: 'Sliding rear doors are a parent superpower; Sharan/Alhambra reliability is solid.',
      weaknesses: 'Older Euro 6b — restricted in some Paris/Brussels central zones; dated tech.',
    }
  );

  // ---- Urban BEVs ----
  MODELS.push(
    {
      id: 'dacia-spring', archetypes: ['urban-bev'],
      name: 'Dacia Spring', years: '2021–present', body: 'hatch',
      variants: [
        { name: '26.8 kWh 45 / 65hp', fuel: 'bev', cons: 14.6, co2: 0, hp: 65, gearbox: 'single' },
      ],
      priceUsedEUR: [9000, 16000], priceNewEUR: [16000, 22000],
      euroClass: 'EV', lezAccess: 'ev', ncap: 1, reliability: 3,
      strengths: 'Cheapest EV in EU; ~200 km city range; perfect 2nd-car commuter.',
      weaknesses: 'NCAP 1★ (no AEB on base, weak crash structure); slow DC charge (30 kW).',
    },
    {
      id: 'fiat-500e', archetypes: ['urban-bev'],
      name: 'Fiat 500e (la Prima)', years: '2020–present', body: 'hatch',
      variants: [
        { name: '24 kWh 95hp', fuel: 'bev', cons: 13.5, co2: 0, hp: 95, gearbox: 'single' },
        { name: '42 kWh 118hp', fuel: 'bev', cons: 14.3, co2: 0, hp: 118, gearbox: 'single' },
      ],
      priceUsedEUR: [13000, 22000], priceNewEUR: [25000, 35000],
      euroClass: 'EV', lezAccess: 'ev', ncap: 4, reliability: 3,
      strengths: '~250 km real range on 42 kWh; design icon; quick DC (~85 kW).',
      weaknesses: 'Tight rear seat; some software glitches; Stellantis service network varies.',
    },
    {
      id: 'renault-zoe-ze50', archetypes: ['urban-bev'],
      name: 'Renault Zoe ZE50', years: '2019–2024', body: 'hatch',
      variants: [
        { name: '52 kWh R110 / R135', fuel: 'bev', cons: 17.2, co2: 0, hp: 135, gearbox: 'single' },
      ],
      priceUsedEUR: [10000, 18000], priceNewEUR: null,
      euroClass: 'EV', lezAccess: 'ev', ncap: 0, reliability: 3,
      strengths: '~300 km real range from a city car; cheap on the used market.',
      weaknesses: '0★ NCAP 2021 (no airbag side curtain — discontinued); some battery rental contracts.',
    },
    {
      id: 'mg4-ev', archetypes: ['urban-bev', 'long-range-bev'],
      name: 'MG4 EV', years: '2022–present', body: 'hatch',
      variants: [
        { name: '51 kWh 170hp', fuel: 'bev', cons: 16.5, co2: 0, hp: 170, gearbox: 'single' },
        { name: '64 kWh 204hp', fuel: 'bev', cons: 16.0, co2: 0, hp: 204, gearbox: 'single' },
        { name: '77 kWh XPower 435hp AWD', fuel: 'bev', cons: 18.8, co2: 0, hp: 435, gearbox: 'single' },
      ],
      priceUsedEUR: [18000, 28000], priceNewEUR: [29000, 42000],
      euroClass: 'EV', lezAccess: 'ev', ncap: 5, reliability: 3,
      strengths: '~400 km real range on 64 kWh for under €35k new — disrupts the segment.',
      weaknesses: 'Software UX clunky; Chinese brand long-term resale unproven in EU.',
    }
  );

  // ---- Long-range BEVs ----
  MODELS.push(
    {
      id: 'tesla-model-3', archetypes: ['long-range-bev'],
      name: 'Tesla Model 3 (Highland)', years: '2017–present', body: 'sedan',
      variants: [
        { name: 'RWD 60 kWh', fuel: 'bev', cons: 14.0, co2: 0, hp: 283, gearbox: 'single' },
        { name: 'Long Range AWD 79 kWh', fuel: 'bev', cons: 14.5, co2: 0, hp: 366, gearbox: 'single' },
        { name: 'Performance AWD', fuel: 'bev', cons: 16.0, co2: 0, hp: 510, gearbox: 'single' },
      ],
      priceUsedEUR: [22000, 38000], priceNewEUR: [42000, 60000],
      euroClass: 'EV', lezAccess: 'ev', ncap: 5, reliability: 4,
      strengths: 'Supercharger network is unmatched in EU; best residuals of any BEV.',
      weaknesses: 'Suspension firm on broken roads; Highland minimalist controls divide opinion.',
    },
    {
      id: 'tesla-model-y', archetypes: ['long-range-bev'],
      name: 'Tesla Model Y', years: '2020–present', body: 'crossover',
      variants: [
        { name: 'RWD 60 kWh', fuel: 'bev', cons: 14.5, co2: 0, hp: 295, gearbox: 'single' },
        { name: 'Long Range AWD 79 kWh', fuel: 'bev', cons: 15.5, co2: 0, hp: 384, gearbox: 'single' },
      ],
      priceUsedEUR: [28000, 45000], priceNewEUR: [45000, 60000],
      euroClass: 'EV', lezAccess: 'ev', ncap: 5, reliability: 4,
      strengths: 'Best-selling car (any fuel) in EU 2023; huge boot; supercharger network.',
      weaknesses: 'Same suspension/UI critiques as 3; high beltline limits visibility for kids.',
    },
    {
      id: 'hyundai-ioniq5', archetypes: ['long-range-bev'],
      name: 'Hyundai Ioniq 5', years: '2021–present', body: 'crossover',
      variants: [
        { name: '58 kWh RWD 170hp', fuel: 'bev', cons: 16.7, co2: 0, hp: 170, gearbox: 'single' },
        { name: '77.4 kWh RWD 228hp', fuel: 'bev', cons: 16.8, co2: 0, hp: 228, gearbox: 'single' },
        { name: '77.4 kWh AWD 325hp', fuel: 'bev', cons: 17.7, co2: 0, hp: 325, gearbox: 'single' },
      ],
      priceUsedEUR: [28000, 45000], priceNewEUR: [44000, 65000],
      euroClass: 'EV', lezAccess: 'ev', ncap: 5, reliability: 4,
      strengths: '800 V architecture: 10–80 % in 18 minutes on a 350 kW charger; design icon.',
      weaknesses: 'Heat pump optional (cold weather range hit without it); ICCU recall 2022–24.',
    },
    {
      id: 'kia-ev6', archetypes: ['long-range-bev'],
      name: 'Kia EV6', years: '2021–present', body: 'crossover',
      variants: [
        { name: '58 kWh RWD 170hp', fuel: 'bev', cons: 16.5, co2: 0, hp: 170, gearbox: 'single' },
        { name: '77.4 kWh RWD 229hp', fuel: 'bev', cons: 16.5, co2: 0, hp: 229, gearbox: 'single' },
        { name: 'GT 77.4 kWh 585hp AWD', fuel: 'bev', cons: 20.0, co2: 0, hp: 585, gearbox: 'single' },
      ],
      priceUsedEUR: [30000, 48000], priceNewEUR: [48000, 75000],
      euroClass: 'EV', lezAccess: 'ev', ncap: 5, reliability: 4,
      strengths: 'Same 800 V platform as Ioniq 5; sportier ride; 7-yr Kia warranty.',
      weaknesses: 'Smaller boot than Ioniq 5; same ICCU recall; firm low-speed ride.',
    },
    {
      id: 'vw-id4', archetypes: ['long-range-bev'],
      name: 'VW ID.4', years: '2020–present', body: 'crossover',
      variants: [
        { name: 'Pure 52 kWh 170hp', fuel: 'bev', cons: 16.5, co2: 0, hp: 170, gearbox: 'single' },
        { name: 'Pro 77 kWh 204hp RWD', fuel: 'bev', cons: 17.5, co2: 0, hp: 204, gearbox: 'single' },
        { name: 'GTX 77 kWh AWD 295hp', fuel: 'bev', cons: 19.0, co2: 0, hp: 295, gearbox: 'single' },
      ],
      priceUsedEUR: [22000, 40000], priceNewEUR: [42000, 58000],
      euroClass: 'EV', lezAccess: 'ev', ncap: 5, reliability: 3,
      strengths: 'Comfortable cruiser; Pro version does 350+ km real on motorway.',
      weaknesses: 'Software pre-2023 was buggy (now improved); slower DC charge than Korean rivals.',
    },
    {
      id: 'skoda-enyaq', archetypes: ['long-range-bev'],
      name: 'Skoda Enyaq iV', years: '2020–present', body: 'crossover',
      variants: [
        { name: '60 (58 kWh) 180hp', fuel: 'bev', cons: 16.5, co2: 0, hp: 180, gearbox: 'single' },
        { name: '85 (77 kWh) 286hp', fuel: 'bev', cons: 17.0, co2: 0, hp: 286, gearbox: 'single' },
      ],
      priceUsedEUR: [25000, 40000], priceNewEUR: [42000, 58000],
      euroClass: 'EV', lezAccess: 'ev', ncap: 5, reliability: 4,
      strengths: 'Same MEB platform as ID.4 but cheaper to buy and noticeably more practical.',
      weaknesses: 'Same MEB software niggles pre-2023; rear visibility limited.',
    },
    {
      id: 'bmw-i4', archetypes: ['long-range-bev'],
      name: 'BMW i4', years: '2021–present', body: 'sedan',
      variants: [
        { name: 'eDrive35 67 kWh 286hp', fuel: 'bev', cons: 16.5, co2: 0, hp: 286, gearbox: 'single' },
        { name: 'eDrive40 81 kWh 340hp', fuel: 'bev', cons: 17.0, co2: 0, hp: 340, gearbox: 'single' },
        { name: 'M50 81 kWh AWD 544hp', fuel: 'bev', cons: 22.0, co2: 0, hp: 544, gearbox: 'single' },
      ],
      priceUsedEUR: [38000, 60000], priceNewEUR: [62000, 90000],
      euroClass: 'EV', lezAccess: 'ev', ncap: 5, reliability: 4,
      strengths: 'Drives like a 4-Series; eDrive40 nails ~480 km real range; premium cabin.',
      weaknesses: 'Hatchback boot less practical than i5; M50 inefficient on motorway.',
    }
  );

  // ---- Body-on-frame 4x4 ----
  MODELS.push(
    {
      id: 'toyota-land-cruiser-j300', archetypes: ['offroad-4x4'],
      name: 'Toyota Land Cruiser 250 / J300', years: '2021–present', body: 'suv',
      variants: [
        { name: '2.8 D-4D 204hp 6AT', fuel: 'diesel', cons: 9.5, co2: 250, hp: 204, gearbox: 'auto' },
      ],
      priceUsedEUR: [35000, 80000], priceNewEUR: [78000, 120000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 5,
      strengths: 'Hand of god reliability — Sahara/Atacama tested; holds value better than any other SUV.',
      weaknesses: '~10 L/100 km on highway; expensive new; bulky in cities.',
    },
    {
      id: 'jeep-wrangler-jl', archetypes: ['offroad-4x4'],
      name: 'Jeep Wrangler JL / 4xe', years: '2018–present', body: 'suv',
      variants: [
        { name: '2.0 GME T 272hp', fuel: 'petrol', cons: 9.6, co2: 219, hp: 272, gearbox: 'auto' },
        { name: '2.0 GME 4xe PHEV 380hp', fuel: 'phev', cons: 3.5, co2: 80, hp: 380, gearbox: 'auto' },
      ],
      priceUsedEUR: [28000, 55000], priceNewEUR: [60000, 85000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 1, reliability: 3,
      strengths: 'Removable doors and roof; trail rated, no compromise off-road.',
      weaknesses: 'NCAP 1★ (poor crash structure); dreadful drag coefficient (motorway thirst).',
    },
    {
      id: 'land-rover-defender-l663', archetypes: ['offroad-4x4', 'seven-seat-suv'],
      name: 'Land Rover Defender L663', years: '2020–present', body: 'suv',
      variants: [
        { name: 'D250 MHEV 249hp', fuel: 'diesel', cons: 8.6, co2: 226, hp: 249, gearbox: 'auto' },
        { name: 'P400 MHEV 400hp', fuel: 'mhev', cons: 10.7, co2: 244, hp: 400, gearbox: 'auto' },
        { name: 'P400e PHEV 404hp', fuel: 'phev', cons: 3.6, co2: 81, hp: 404, gearbox: 'auto' },
      ],
      priceUsedEUR: [50000, 85000], priceNewEUR: [80000, 130000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 2,
      strengths: 'Unmatched off-road combined with luxury cabin; 110 has 7 seats.',
      weaknesses: 'JLR reliability is the worst in this segment; air suspension expensive.',
    },
    {
      id: 'suzuki-jimny-jb74', archetypes: ['offroad-4x4'],
      name: 'Suzuki Jimny JB74', years: '2018–present (commercial in EU)', body: 'suv',
      variants: [
        { name: '1.5 K15B 102hp 4x4', fuel: 'petrol', cons: 6.4, co2: 154, hp: 102, gearbox: 'manual/auto' },
      ],
      priceUsedEUR: [16000, 26000], priceNewEUR: [24000, 32000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 3, reliability: 5,
      strengths: 'Tiny, light, properly capable off-road; cult-status resale.',
      weaknesses: 'Sold only as N1 commercial in EU since 2021 (CO2 reasons); 4 seats only on N1.',
    }
  );

  // ---- Pickup ----
  MODELS.push(
    {
      id: 'toyota-hilux-an130', archetypes: ['pickup-workhorse'],
      name: 'Toyota Hilux AN130 (8th gen)', years: '2015–present', body: 'pickup',
      variants: [
        { name: '2.4 D-4D 150hp 4x4', fuel: 'diesel', cons: 8.0, co2: 210, hp: 150, gearbox: 'manual/auto' },
        { name: '2.8 D-4D 204hp 4x4', fuel: 'diesel', cons: 8.5, co2: 222, hp: 204, gearbox: 'auto' },
      ],
      priceUsedEUR: [18000, 38000], priceNewEUR: [42000, 60000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 5,
      strengths: 'Indestructible reputation (UN, oil-field standard); 1 t payload, 3.5 t tow.',
      weaknesses: 'Crashy unladen ride; dated cabin tech vs Ford Ranger.',
    },
    {
      id: 'ford-ranger-p703', archetypes: ['pickup-workhorse'],
      name: 'Ford Ranger P703 (next-gen)', years: '2022–present', body: 'pickup',
      variants: [
        { name: '2.0 EcoBlue 170 / 205hp', fuel: 'diesel', cons: 7.5, co2: 196, hp: 205, gearbox: 'manual/auto' },
        { name: '3.0 V6 EcoBlue 240hp', fuel: 'diesel', cons: 8.7, co2: 230, hp: 240, gearbox: 'auto' },
        { name: '2.3 EcoBoost PHEV (Raptor PHEV)', fuel: 'phev', cons: 3.0, co2: 70, hp: 281, gearbox: 'auto' },
      ],
      priceUsedEUR: [25000, 50000], priceNewEUR: [45000, 75000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: 'Most car-like cabin and best on-road manners of any pickup in EU.',
      weaknesses: 'V6 thirsty; Raptor wide for narrow EU roads; PHEV sold late 2024.',
    },
    {
      id: 'vw-amarok-mk2', archetypes: ['pickup-workhorse'],
      name: 'VW Amarok II', years: '2022–present', body: 'pickup',
      variants: [
        { name: '2.0 TDI 170 / 205hp', fuel: 'diesel', cons: 8.0, co2: 209, hp: 205, gearbox: 'auto' },
        { name: '3.0 V6 TDI 240hp', fuel: 'diesel', cons: 9.0, co2: 235, hp: 240, gearbox: 'auto' },
      ],
      priceUsedEUR: [28000, 50000], priceNewEUR: [50000, 75000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: 'Joint-developed with Ford Ranger; VW interior trim level on a workhorse.',
      weaknesses: 'Same ladder frame as Ranger but ~€3–5k more expensive; service network smaller.',
    },
    {
      id: 'mitsubishi-l200-vi', archetypes: ['pickup-workhorse'],
      name: 'Mitsubishi L200 VI', years: '2015–2024', body: 'pickup',
      variants: [
        { name: '2.2 / 2.4 DI-D 150 / 181hp', fuel: 'diesel', cons: 8.5, co2: 220, hp: 181, gearbox: 'manual/auto' },
      ],
      priceUsedEUR: [12000, 30000], priceNewEUR: null,
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 4, reliability: 4,
      strengths: 'Cheapest used full-size pickup; Super-Select 4WD locks like a real off-roader.',
      weaknesses: 'Discontinued in EU 2024; 5-cyl 2.4 DI-D needs frequent oil changes.',
    }
  );

  // ---- Cargo van ----
  MODELS.push(
    {
      id: 'vw-transporter-t6', archetypes: ['cargo-van'],
      name: 'VW Transporter T6 / T6.1', years: '2015–2023', body: 'van',
      variants: [
        { name: '2.0 TDI 110 / 150 / 199hp', fuel: 'diesel', cons: 7.4, co2: 195, hp: 150, gearbox: 'manual/dsg' },
      ],
      priceUsedEUR: [12000, 32000], priceNewEUR: [38000, 55000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: null, reliability: 4,
      strengths: 'Best-built panel van in EU; campervan conversion potential keeps residuals strong.',
      weaknesses: 'Pricey vs Ford Transit; 2.0 TDI EGR cooler issues 2016–18.',
    },
    {
      id: 'mercedes-vito-w447', archetypes: ['cargo-van'],
      name: 'Mercedes Vito W447 / eVito', years: '2014–present', body: 'van',
      variants: [
        { name: '110 / 116 / 119 CDI', fuel: 'diesel', cons: 7.6, co2: 200, hp: 190, gearbox: 'manual/auto' },
        { name: 'eVito 90 kWh', fuel: 'bev', cons: 22, co2: 0, hp: 116, gearbox: 'single' },
      ],
      priceUsedEUR: [11000, 30000], priceNewEUR: [35000, 55000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: null, reliability: 4,
      strengths: 'Mercedes star sells well to taxi/airport-shuttle fleets; RWD tows well.',
      weaknesses: 'AdBlue maintenance pricier than competition; 7G-Tronic auto can lurch.',
    },
    {
      id: 'ford-transit-custom', archetypes: ['cargo-van'],
      name: 'Ford Transit Custom', years: '2012–present', body: 'van',
      variants: [
        { name: '2.0 EcoBlue 110 / 130 / 170hp', fuel: 'diesel', cons: 7.0, co2: 184, hp: 170, gearbox: 'manual/auto' },
        { name: 'E-Transit Custom 64 kWh', fuel: 'bev', cons: 22, co2: 0, hp: 218, gearbox: 'single' },
      ],
      priceUsedEUR: [9000, 28000], priceNewEUR: [32000, 52000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: null, reliability: 3,
      strengths: 'Best-selling van in UK and EU; cheap to buy and maintain; huge spares network.',
      weaknesses: '2.0 EcoBlue wet timing belt service; some DCT auto reliability issues.',
    },
    {
      id: 'fiat-ducato', archetypes: ['cargo-van'],
      name: 'Fiat Ducato (Citroën Jumper / Peugeot Boxer)', years: '2014–present', body: 'van',
      variants: [
        { name: '2.2 MultiJet 140 / 180hp', fuel: 'diesel', cons: 8.2, co2: 210, hp: 180, gearbox: 'manual/auto' },
        { name: 'E-Ducato 110 kWh', fuel: 'bev', cons: 26, co2: 0, hp: 122, gearbox: 'single' },
      ],
      priceUsedEUR: [10000, 28000], priceNewEUR: [32000, 50000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: null, reliability: 3,
      strengths: 'Largest interior in segment; ~70 % of motorhome conversions in EU use this base.',
      weaknesses: 'Drives like a truck (it is one); 2.2 MultiJet AdBlue/EGR issues.',
    }
  );

  // ---- Sports coupe ----
  MODELS.push(
    {
      id: 'porsche-cayman-718', archetypes: ['sports-coupe'],
      name: 'Porsche 718 Cayman', years: '2016–2025 (ICE)', body: 'coupe',
      variants: [
        { name: '2.0 / 2.5 turbo 300 / 365hp', fuel: 'petrol', cons: 8.7, co2: 199, hp: 365, gearbox: 'manual/pdk' },
        { name: 'GT4 4.0 NA 420hp', fuel: 'petrol', cons: 10.9, co2: 249, hp: 420, gearbox: 'manual/pdk' },
      ],
      priceUsedEUR: [40000, 80000], priceNewEUR: [70000, 120000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: null, reliability: 5,
      strengths: 'Best-handling chassis under €100k; mid-engine balance; PDK is sublime.',
      weaknesses: '4-cyl turbo sound divisive (vs old NA flat-6); EV replacement coming, ICE values may rise.',
    },
    {
      id: 'bmw-m2-g87', archetypes: ['sports-coupe'],
      name: 'BMW M2 G87', years: '2023–present', body: 'coupe',
      variants: [
        { name: '3.0 S58 460hp RWD', fuel: 'petrol', cons: 9.7, co2: 220, hp: 460, gearbox: 'manual/auto' },
      ],
      priceUsedEUR: [60000, 80000], priceNewEUR: [75000, 95000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: null, reliability: 4,
      strengths: 'Last manual M-car; pure RWD coupe in an EV world; 460hp from a small footprint.',
      weaknesses: 'Polarising styling; firm ride on broken roads; not exactly economical.',
    },
    {
      id: 'audi-rs3-8y', archetypes: ['sports-coupe'],
      name: 'Audi RS3 8Y', years: '2021–present', body: 'sedan',
      variants: [
        { name: '2.5 TFSI quattro 400hp', fuel: 'petrol', cons: 8.9, co2: 203, hp: 400, gearbox: 'auto' },
      ],
      priceUsedEUR: [50000, 75000], priceNewEUR: [70000, 90000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: null, reliability: 4,
      strengths: 'Glorious 5-cyl noise; AWD makes it usable year-round; 0–100 in 3.8 s.',
      weaknesses: '1500+ kg = thirstier than RWD rivals; expensive maintenance on quattro hardware.',
    },
    {
      id: 'toyota-gr-supra', archetypes: ['sports-coupe'],
      name: 'Toyota GR Supra (J29)', years: '2019–present', body: 'coupe',
      variants: [
        { name: '2.0 B48 258hp', fuel: 'petrol', cons: 7.3, co2: 167, hp: 258, gearbox: 'auto' },
        { name: '3.0 B58 340 / 387hp', fuel: 'petrol', cons: 8.8, co2: 200, hp: 387, gearbox: 'manual/auto' },
      ],
      priceUsedEUR: [35000, 58000], priceNewEUR: [55000, 75000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: null, reliability: 5,
      strengths: 'BMW B58 inline-6 in a Toyota body — best of both reliability cultures.',
      weaknesses: 'Tight cabin; visibility limited; 6-speed manual only added 2022.',
    }
  );

  // ---- Cabrio ----
  MODELS.push(
    {
      id: 'mazda-mx5-nd', archetypes: ['cabrio'],
      name: 'Mazda MX-5 ND', years: '2015–present', body: 'cabrio',
      variants: [
        { name: '1.5 Skyactiv-G 132hp', fuel: 'petrol', cons: 6.6, co2: 150, hp: 132, gearbox: 'manual' },
        { name: '2.0 Skyactiv-G 184hp', fuel: 'petrol', cons: 7.0, co2: 159, hp: 184, gearbox: 'manual' },
      ],
      priceUsedEUR: [16000, 30000], priceNewEUR: [32000, 42000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 4, reliability: 5,
      strengths: 'The default driver\'s car under €40k; light (1050 kg), pure, RWD, manual.',
      weaknesses: 'Tiny boot (130 L); soft top wears around 8–10 years; not a daily driver.',
    },
    {
      id: 'bmw-z4-g29', archetypes: ['cabrio'],
      name: 'BMW Z4 G29', years: '2018–present', body: 'cabrio',
      variants: [
        { name: 'sDrive20i 197hp', fuel: 'petrol', cons: 6.7, co2: 152, hp: 197, gearbox: 'auto' },
        { name: 'sDrive30i 258hp', fuel: 'petrol', cons: 7.1, co2: 161, hp: 258, gearbox: 'auto' },
        { name: 'M40i 340hp', fuel: 'petrol', cons: 8.5, co2: 193, hp: 340, gearbox: 'manual/auto' },
      ],
      priceUsedEUR: [30000, 55000], priceNewEUR: [55000, 80000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: null, reliability: 4,
      strengths: 'Same engine/chassis as Toyota Supra; soft-top operates at speeds up to 50 km/h.',
      weaknesses: 'Heavier and pricier than MX-5; rear visibility poor with top up.',
    },
    {
      id: 'audi-a5-cabrio', archetypes: ['cabrio'],
      name: 'Audi A5 Cabriolet F5', years: '2017–present', body: 'cabrio',
      variants: [
        { name: '40 TFSI 204hp MHEV', fuel: 'mhev', cons: 7.0, co2: 158, hp: 204, gearbox: 'auto' },
        { name: '45 TFSI quattro 265hp', fuel: 'mhev', cons: 7.6, co2: 173, hp: 265, gearbox: 'auto' },
      ],
      priceUsedEUR: [22000, 45000], priceNewEUR: [55000, 75000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 5, reliability: 4,
      strengths: 'Comfortable 4-seater drop-top; quattro AWD makes it usable in winter.',
      weaknesses: 'Soft-top mechanism complex (€2k+ if it fails); 7-speed S tronic clunky cold.',
    },
    {
      id: 'mini-convertible', archetypes: ['cabrio'],
      name: 'Mini Convertible (F57 / J05)', years: '2016–present', body: 'cabrio',
      variants: [
        { name: 'Cooper 1.5 136hp', fuel: 'petrol', cons: 5.9, co2: 134, hp: 136, gearbox: 'manual/auto' },
        { name: 'Cooper S 2.0 178 / 192hp', fuel: 'petrol', cons: 6.3, co2: 144, hp: 192, gearbox: 'manual/auto' },
        { name: 'Cooper SE Electric 184hp', fuel: 'bev', cons: 16.8, co2: 0, hp: 184, gearbox: 'single' },
      ],
      priceUsedEUR: [14000, 32000], priceNewEUR: [32000, 45000],
      euroClass: 'Euro 6d', lezAccess: 'eu-wide', ncap: 4, reliability: 3,
      strengths: 'Folding fabric roof in 18 seconds; rare go-kart feel in a cabrio.',
      weaknesses: 'Rear seats and boot are token gestures; runflat tires firm; some N20 timing chain on early.',
    }
  );
