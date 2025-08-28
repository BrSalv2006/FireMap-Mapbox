class SPA {
    constructor() {
        this.PI = 3.1415926535897932384626433832795028841971;
        this.SUN_RADIUS = 0.26667;

        this.SPA_ZA = 0;
        this.SPA_ZA_INC = 1;
        this.SPA_ZA_RTS = 2;
        this.SPA_ALL = 3;

        this.data = {
            year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0,
            delta_ut1: 0, delta_t: 0, timezone: 0, longitude: 0,
            latitude: 0, elevation: 0, pressure: 0, temperature: 0,
            slope: 0, azm_rotation: 0, atmos_refract: 0, function: this.SPA_ALL,

            jd: 0, jc: 0, jde: 0, jce: 0, jme: 0, l: 0, b: 0, r: 0,
            theta: 0, beta: 0, x0: 0, x1: 0, x2: 0, x3: 0, x4: 0,
            del_psi: 0, del_epsilon: 0, epsilon0: 0, epsilon: 0,
            del_tau: 0, lamda: 0, nu0: 0, nu: 0, alpha: 0, delta: 0,
            h: 0, xi: 0, del_alpha: 0, delta_prime: 0, alpha_prime: 0,
            h_prime: 0, e0: 0, del_e: 0, e: 0, eot: 0, srha: 0, ssha: 0,
            sta: 0, zenith: 0, azimuth_astro: 0, azimuth: 0, incidence: 0,
            suntransit: 0, sunrise: 0, sunset: 0
        };
    }

    rad2deg(radians) { return (180.0 / this.PI) * radians; }
    deg2rad(degrees) { return (this.PI / 180.0) * degrees; }

    limit_degrees(degrees) {
        let limited = degrees / 360.0;
        limited = 360.0 * (limited - Math.floor(limited));
        if (limited < 0) limited += 360.0;
        return limited;
    }

    julian_day(year, month, day, hour, minute, second, dut1, tz) {
        let day_decimal = day + (hour - tz + (minute + (second + dut1) / 60.0) / 60.0) / 24.0;
        if (month < 3) {
            month += 12;
            year--;
        }
        let julian_day = Math.trunc(365.25 * (year + 4716.0)) + Math.trunc(30.6001 * (month + 1)) + day_decimal - 1524.5;
        if (julian_day > 2299160.0) {
            let a = Math.trunc(year / 100);
            julian_day += (2 - a + Math.trunc(a / 4));
        }
        return julian_day;
    }

    julian_century(jd) { return (jd - 2451545.0) / 36525.0; }
    julian_ephemeris_day(jd, delta_t) { return jd + delta_t / 86400.0; }
    julian_ephemeris_century(jde) { return (jde - 2451545.0) / 36525.0; }
    julian_ephemeris_millennium(jce) { return (jce / 10.0); }

    geocentric_longitude(l) {
        let theta = l + 180.0;
        if (theta >= 360.0) theta -= 360.0;
        return theta;
    }

    geocentric_latitude(b) { return -b; }

    mean_elongation_moon_sun(jce) { return this.third_order_polynomial(1.0 / 189474.0, -0.0019142, 445267.11148, 297.85036, jce); }
    mean_anomaly_sun(jce) { return this.third_order_polynomial(-1.0 / 300000.0, -0.0001603, 35999.05034, 357.52772, jce); }
    mean_anomaly_moon(jce) { return this.third_order_polynomial(1.0 / 56250.0, 0.0086972, 477198.867398, 134.96298, jce); }
    argument_latitude_moon(jce) { return this.third_order_polynomial(1.0 / 327270.0, -0.0036825, 483202.017538, 93.27191, jce); }
    ascending_longitude_moon(jce) { return this.third_order_polynomial(1.0 / 450000.0, 0.0020708, -1934.136261, 125.04452, jce); }

    third_order_polynomial(a, b, c, d, x) { return ((a * x + b) * x + c) * x + d; }

    geocentric_right_ascension(lamda, epsilon, beta) {
        const lamda_rad = this.deg2rad(lamda);
        const epsilon_rad = this.deg2rad(epsilon);
        return this.limit_degrees(this.rad2deg(Math.atan2(Math.sin(lamda_rad) * Math.cos(epsilon_rad) -
            Math.tan(this.deg2rad(beta)) * Math.sin(epsilon_rad), Math.cos(lamda_rad))));
    }

    geocentric_declination(beta, epsilon, lamda) {
        const beta_rad = this.deg2rad(beta);
        const epsilon_rad = this.deg2rad(epsilon);
        return this.rad2deg(Math.asin(Math.sin(beta_rad) * Math.cos(epsilon_rad) +
            Math.cos(beta_rad) * Math.sin(epsilon_rad) * Math.sin(this.deg2rad(lamda))));
    }

    observer_hour_angle(nu, longitude, alpha_deg) {
        return this.limit_degrees(nu + longitude - alpha_deg);
    }

    topocentric_right_ascension(alpha_deg, delta_alpha) { return alpha_deg + delta_alpha; }
    topocentric_local_hour_angle(h, delta_alpha) { return h - delta_alpha; }

    topocentric_elevation_angle(latitude, delta_prime, h_prime) {
        const lat_rad = this.deg2rad(latitude);
        const delta_prime_rad = this.deg2rad(delta_prime);
        return this.rad2deg(Math.asin(Math.sin(lat_rad) * Math.sin(delta_prime_rad) +
            Math.cos(lat_rad) * Math.cos(delta_prime_rad) * Math.cos(this.deg2rad(h_prime))));
    }

    atmospheric_refraction_correction(pressure, temperature, atmos_refract, e0) {
        let del_e = 0;
        if (e0 >= -1 * (this.SUN_RADIUS + atmos_refract)) {
            del_e = (pressure / 1010.0) * (283.0 / (273.0 + temperature)) *
                1.02 / (60.0 * Math.tan(this.deg2rad(e0 + 10.3 / (e0 + 5.11))));
        }
        return del_e;
    }

    topocentric_elevation_angle_corrected(e0, delta_e) { return e0 + delta_e; }
    topocentric_zenith_angle(e) { return 90.0 - e; }

    topocentric_azimuth_angle_astro(h_prime, latitude, delta_prime) {
        const h_prime_rad = this.deg2rad(h_prime);
        const lat_rad = this.deg2rad(latitude);
        return this.limit_degrees(this.rad2deg(Math.atan2(Math.sin(h_prime_rad),
            Math.cos(h_prime_rad) * Math.sin(lat_rad) - Math.tan(this.deg2rad(delta_prime)) * Math.cos(lat_rad))));
    }

    topocentric_azimuth_angle(azimuth_astro) { return this.limit_degrees(azimuth_astro + 180.0); }

    surface_incidence_angle(zenith, azimuth_astro, azm_rotation, slope) {
        const zenith_rad = this.deg2rad(zenith);
        const slope_rad = this.deg2rad(slope);
        return this.rad2deg(Math.acos(Math.cos(zenith_rad) * Math.cos(slope_rad) +
            Math.sin(slope_rad) * Math.sin(zenith_rad) * Math.cos(this.deg2rad(azimuth_astro - azm_rotation))));
    }

    calculate() {
        const spa = this.data;
        const result = this.validate_inputs(spa);
        if (result !== 0) return result;

        spa.jd = this.julian_day(spa.year, spa.month, spa.day, spa.hour, spa.minute, spa.second, spa.delta_ut1, spa.timezone);
        this.calculate_geocentric_sun_right_ascension_and_declination(spa);

        spa.h = this.observer_hour_angle(spa.nu, spa.longitude, spa.alpha);
        spa.xi = this.sun_equatorial_horizontal_parallax(spa.r);

        const parallax_result = this.right_ascension_parallax_and_topocentric_dec(spa.latitude, spa.elevation, spa.xi, spa.h, spa.delta);
        spa.del_alpha = parallax_result.delta_alpha;
        spa.delta_prime = parallax_result.delta_prime;

        spa.alpha_prime = this.topocentric_right_ascension(spa.alpha, spa.del_alpha);
        spa.h_prime = this.topocentric_local_hour_angle(spa.h, spa.del_alpha);
        spa.e0 = this.topocentric_elevation_angle(spa.latitude, spa.delta_prime, spa.h_prime);
        spa.del_e = this.atmospheric_refraction_correction(spa.pressure, spa.temperature, spa.atmos_refract, spa.e0);
        spa.e = this.topocentric_elevation_angle_corrected(spa.e0, spa.del_e);
        spa.zenith = this.topocentric_zenith_angle(spa.e);
        spa.azimuth_astro = this.topocentric_azimuth_angle_astro(spa.h_prime, spa.latitude, spa.delta_prime);
        spa.azimuth = this.topocentric_azimuth_angle(spa.azimuth_astro);

        if (spa.function === this.SPA_ZA_INC || spa.function === this.SPA_ALL) {
            spa.incidence = this.surface_incidence_angle(spa.zenith, spa.azimuth_astro, spa.azm_rotation, spa.slope);
        }

        if (spa.function === this.SPA_ZA_RTS || spa.function === this.SPA_ALL) {
            this.calculate_eot_and_sun_rise_transit_set(spa);
        }

        return 0;
    }

    validate_inputs(spa) {
        if ((spa.year < -2000) || (spa.year > 6000)) return 1;
        if ((spa.month < 1) || (spa.month > 12)) return 2;
        if ((spa.day < 1) || (spa.day > 31)) return 3;
        if ((spa.hour < 0) || (spa.hour > 24)) return 4;
        if ((spa.minute < 0) || (spa.minute > 59)) return 5;
        if ((spa.second < 0) || (spa.second >= 60)) return 6;
        if ((spa.pressure < 0) || (spa.pressure > 5000)) return 12;
        if ((spa.temperature <= -273) || (spa.temperature > 6000)) return 13;
        if ((spa.delta_ut1 <= -1) || (spa.delta_ut1 >= 1)) return 17;
        if ((spa.hour === 24) && (spa.minute > 0)) return 5;
        if ((spa.hour === 24) && (spa.second > 0)) return 6;
        if (Math.abs(spa.delta_t) > 8000) return 7;
        if (Math.abs(spa.timezone) > 18) return 8;
        if (Math.abs(spa.longitude) > 180) return 9;
        if (Math.abs(spa.latitude) > 90) return 10;
        if (Math.abs(spa.atmos_refract) > 5) return 16;
        if (spa.elevation < -6500000) return 11;
        if ((spa.function === this.SPA_ZA_INC) || (spa.function === this.SPA_ALL)) {
            if (Math.abs(spa.slope) > 360) return 14;
            if (Math.abs(spa.azm_rotation) > 360) return 15;
        }
        return 0;
    }

    calculate_geocentric_sun_right_ascension_and_declination(spa) {
        const x = new Array(5);
        spa.jc = this.julian_century(spa.jd);
        spa.jde = this.julian_ephemeris_day(spa.jd, spa.delta_t);
        spa.jce = this.julian_ephemeris_century(spa.jde);
        spa.jme = this.julian_ephemeris_millennium(spa.jce);
        spa.l = this.earth_heliocentric_longitude(spa.jme);
        spa.b = this.earth_heliocentric_latitude(spa.jme);
        spa.r = this.earth_radius_vector(spa.jme);
        spa.theta = this.geocentric_longitude(spa.l);
        spa.beta = this.geocentric_latitude(spa.b);
        x[0] = spa.x0 = this.mean_elongation_moon_sun(spa.jce);
        x[1] = spa.x1 = this.mean_anomaly_sun(spa.jce);
        x[2] = spa.x2 = this.mean_anomaly_moon(spa.jce);
        x[3] = spa.x3 = this.argument_latitude_moon(spa.jce);
        x[4] = spa.x4 = this.ascending_longitude_moon(spa.jce);
        const nutation = this.nutation_longitude_and_obliquity(spa.jce, x);
        spa.del_psi = nutation.del_psi;
        spa.del_epsilon = nutation.del_epsilon;
        spa.epsilon0 = this.ecliptic_mean_obliquity(spa.jme);
        spa.epsilon = this.ecliptic_true_obliquity(spa.del_epsilon, spa.epsilon0);
        spa.del_tau = this.aberration_correction(spa.r);
        spa.lamda = this.apparent_sun_longitude(spa.theta, spa.del_psi, spa.del_tau);
        spa.nu0 = this.greenwich_mean_sidereal_time(spa.jd, spa.jc);
        spa.nu = this.greenwich_sidereal_time(spa.nu0, spa.del_psi, spa.epsilon);
        spa.alpha = this.geocentric_right_ascension(spa.lamda, spa.epsilon, spa.beta);
        spa.delta = this.geocentric_declination(spa.beta, spa.epsilon, spa.lamda);
    }

    calculate_eot_and_sun_rise_transit_set(spa) {
        const sun_rts = { ...spa };
        let m = this.sun_mean_longitude(spa.jme);
        spa.eot = this.eot(m, spa.alpha, spa.del_psi, spa.epsilon);
        sun_rts.hour = sun_rts.minute = sun_rts.second = 0;
        sun_rts.delta_ut1 = sun_rts.timezone = 0.0;
        sun_rts.jd = this.julian_day(sun_rts.year, sun_rts.month, sun_rts.day, sun_rts.hour,
            sun_rts.minute, sun_rts.second, sun_rts.delta_ut1, sun_rts.timezone);
        this.calculate_geocentric_sun_right_ascension_and_declination(sun_rts);
        const nu = sun_rts.nu;
        sun_rts.delta_t = 0;
        sun_rts.jd--;
        const alpha = [], delta = [];
        for (let i = 0; i < 3; i++) {
            this.calculate_geocentric_sun_right_ascension_and_declination(sun_rts);
            alpha[i] = sun_rts.alpha;
            delta[i] = sun_rts.delta;
            sun_rts.jd++;
        }
        const m_rts = [];
        m_rts[0] = this.approx_sun_transit_time(alpha[1], spa.longitude, nu);
        const h0_prime = -1 * (this.SUN_RADIUS + spa.atmos_refract);
        let h0 = this.sun_hour_angle_at_rise_set(spa.latitude, delta[1], h0_prime);

        if (h0 >= 0) {
            const rts_results = this.approx_sun_rise_and_set(m_rts[0], h0);
            m_rts[1] = rts_results.sunrise;
            m_rts[2] = rts_results.sunset;
            m_rts[0] = rts_results.suntransit;

            const nu_rts = [], h_rts = [], alpha_prime = [], delta_prime = [], h_prime = [];
            for (let i = 0; i < 3; i++) {
                nu_rts[i] = nu + 360.985647 * m_rts[i];
                let n = m_rts[i] + spa.delta_t / 86400.0;
                alpha_prime[i] = this.rts_alpha_delta_prime(alpha, n);
                delta_prime[i] = this.rts_alpha_delta_prime(delta, n);
                h_prime[i] = this.limit_degrees180pm(nu_rts[i] + spa.longitude - alpha_prime[i]);
                h_rts[i] = this.rts_sun_altitude(spa.latitude, delta_prime[i], h_prime[i]);
            }
            spa.srha = h_prime[1];
            spa.ssha = h_prime[2];
            spa.sta = h_rts[0];
            spa.suntransit = this.dayfrac_to_local_hr(m_rts[0] - h_prime[0] / 360.0, spa.timezone);
            spa.sunrise = this.dayfrac_to_local_hr(this.sun_rise_and_set(m_rts, h_rts, delta_prime, spa.latitude, h_prime, h0_prime, 1), spa.timezone);
            spa.sunset = this.dayfrac_to_local_hr(this.sun_rise_and_set(m_rts, h_rts, delta_prime, spa.latitude, h_prime, h0_prime, 2), spa.timezone);
        } else {
            spa.srha = spa.ssha = spa.sta = spa.suntransit = spa.sunrise = spa.sunset = -99999;
        }
    }

    earth_periodic_term_summation(terms, count, jme) {
        let sum = 0;
        for (let i = 0; i < count; i++) {
            sum += terms[i][0] * Math.cos(terms[i][1] + terms[i][2] * jme);
        }
        return sum;
    }

    earth_values(term_sum, count, jme) {
        let sum = 0;
        for (let i = 0; i < count; i++) {
            sum += term_sum[i] * Math.pow(jme, i);
        }
        return sum / 1.0e8;
    }

    earth_heliocentric_longitude(jme) {
        const L_TERMS = [
            [[175347046, 0, 0], [3341656, 4.6692568, 6283.07585], [34894, 4.6261, 12566.1517], [3497, 2.7441, 5753.3849], [3418, 2.8289, 3.5231], [3136, 3.6277, 77713.7715], [2676, 4.4181, 7860.4194], [2343, 6.1352, 3930.2097], [1324, 0.7425, 11506.7698], [1273, 2.0371, 529.691], [1199, 1.1096, 1577.3435], [990, 5.233, 5884.927], [902, 2.045, 26.298], [857, 3.508, 398.149], [780, 1.179, 5223.694], [753, 2.533, 5507.553], [505, 4.583, 18849.228], [492, 4.205, 775.523], [357, 2.92, 0.067], [317, 5.849, 11790.629], [284, 1.899, 796.298], [271, 0.315, 10977.079], [243, 0.345, 5486.778], [206, 4.806, 2544.314], [205, 1.869, 5573.143], [202, 2.458, 6069.777], [156, 0.833, 213.299], [132, 3.411, 2942.463], [126, 1.083, 20.775], [115, 0.645, 0.98], [103, 0.636, 4694.003], [102, 0.976, 15720.839], [102, 4.267, 7.114], [99, 6.21, 2146.17], [98, 0.68, 155.42], [86, 5.98, 161000.69], [85, 1.3, 6275.96], [85, 3.67, 71430.7], [80, 1.81, 17260.15], [79, 3.04, 12036.46], [75, 1.76, 5088.63], [74, 3.5, 3154.69], [74, 4.68, 801.82], [70, 0.83, 9437.76], [62, 3.98, 8827.39], [61, 1.82, 7084.9], [57, 2.78, 6286.6], [56, 4.39, 14143.5], [56, 3.47, 6279.55], [52, 0.19, 12139.55], [52, 1.33, 1748.02], [51, 0.28, 5856.48], [49, 0.49, 1194.45], [41, 5.37, 8429.24], [41, 2.4, 19651.05], [39, 6.17, 10447.39], [37, 6.04, 10213.29], [37, 2.57, 1059.38], [36, 1.71, 2352.87], [36, 1.78, 6812.77], [33, 0.59, 17789.85], [30, 0.44, 83996.85], [30, 2.74, 1349.87], [25, 3.16, 4690.48]],
            [[628331966747, 0, 0], [206059, 2.678235, 6283.07585], [4303, 2.6351, 12566.1517], [425, 1.59, 3.523], [119, 5.796, 26.298], [109, 2.966, 1577.344], [93, 2.59, 18849.23], [72, 1.14, 529.69], [68, 1.87, 398.15], [67, 4.41, 5507.55], [59, 2.89, 5223.69], [56, 2.17, 155.42], [45, 0.4, 796.3], [36, 0.47, 775.52], [29, 2.65, 7.11], [21, 5.34, 0.98], [19, 1.85, 5486.78], [19, 4.97, 213.3], [17, 2.99, 6275.96], [16, 0.03, 2544.31], [16, 1.43, 2146.17], [15, 1.21, 10977.08], [12, 2.83, 1748.02], [12, 3.26, 5088.63], [12, 5.27, 1194.45], [12, 2.08, 4694], [11, 0.77, 553.57], [10, 1.3, 6286.6], [10, 4.24, 1349.87], [9, 2.7, 242.73], [9, 5.64, 951.72], [8, 5.3, 2352.87], [6, 2.65, 9437.76], [6, 4.67, 4690.48]],
            [[52919, 0, 0], [8720, 1.0721, 6283.0758], [309, 0.867, 12566.152], [27, 0.05, 3.52], [16, 5.19, 26.3], [16, 3.68, 155.42], [10, 0.76, 18849.23], [9, 2.06, 77713.77], [7, 0.83, 775.52], [5, 4.66, 1577.34], [4, 1.03, 7.11], [4, 3.44, 5573.14], [3, 5.14, 796.3], [3, 6.05, 5507.55], [3, 1.19, 242.73], [3, 6.12, 529.69], [3, 0.31, 398.15], [3, 2.28, 553.57], [2, 4.38, 5223.69], [2, 3.75, 0.98]],
            [[289, 5.844, 6283.076], [35, 0, 0], [17, 5.49, 12566.15], [3, 5.2, 155.42], [1, 4.72, 3.52], [1, 5.3, 18849.23], [1, 5.97, 242.73]],
            [[114, 3.142, 0], [8, 4.13, 6283.08], [1, 3.84, 12566.15]],
            [[1, 3.14, 0]]
        ];
        const l_subcount = [64, 34, 20, 7, 3, 1];
        const sum = [];
        for (let i = 0; i < 6; i++) {
            sum[i] = this.earth_periodic_term_summation(L_TERMS[i], l_subcount[i], jme);
        }
        return this.limit_degrees(this.rad2deg(this.earth_values(sum, 6, jme)));
    }

    earth_heliocentric_latitude(jme) {
        const B_TERMS = [
            [[280, 3.199, 84334.662], [102, 5.422, 5507.553], [80, 3.88, 5223.69], [44, 3.7, 2352.87], [32, 4, 1577.34]],
            [[9, 3.9, 5507.55], [6, 1.73, 5223.69]]
        ];
        const b_subcount = [5, 2];
        const sum = [];
        for (let i = 0; i < 2; i++) {
            sum[i] = this.earth_periodic_term_summation(B_TERMS[i], b_subcount[i], jme);
        }
        return this.rad2deg(this.earth_values(sum, 2, jme));
    }

    earth_radius_vector(jme) {
        const R_TERMS = [
            [[100013989, 0, 0], [1670700, 3.0984635, 6283.07585], [13956, 3.05525, 12566.1517], [3084, 5.1985, 77713.7715], [1628, 1.1739, 5753.3849], [1576, 2.8469, 7860.4194], [925, 5.453, 11506.77], [542, 4.564, 3930.21], [472, 3.661, 5884.927], [346, 0.964, 5507.553], [329, 5.9, 5223.694], [307, 0.299, 5573.143], [243, 4.273, 11790.629], [212, 5.847, 1577.344], [186, 5.022, 10977.079], [175, 3.012, 18849.228], [110, 5.055, 5486.778], [98, 0.89, 6069.78], [86, 5.69, 15720.84], [86, 1.27, 161000.69], [65, 0.27, 17260.15], [63, 0.92, 529.69], [57, 2.01, 83996.85], [56, 5.24, 71430.7], [49, 3.25, 2544.31], [47, 2.58, 775.52], [45, 5.54, 9437.76], [43, 6.01, 6275.96], [39, 5.36, 4694], [38, 2.39, 8827.39], [37, 0.83, 19651.05], [37, 4.9, 12139.55], [36, 1.67, 12036.46], [35, 1.84, 2942.46], [33, 0.24, 7084.9], [32, 0.18, 5088.63], [32, 1.78, 398.15], [28, 1.21, 6286.6], [28, 1.9, 6279.55], [26, 4.59, 10447.39]],
            [[103019, 1.10749, 6283.07585], [1721, 1.0644, 12566.1517], [702, 3.142, 0], [32, 1.02, 18849.23], [31, 2.84, 5507.55], [25, 1.32, 5223.69], [18, 1.42, 1577.34], [10, 5.91, 10977.08], [9, 1.42, 6275.96], [9, 0.27, 5486.78]],
            [[4359, 5.7846, 6283.0758], [124, 5.579, 12566.152], [12, 3.14, 0], [9, 3.63, 77713.77], [6, 1.87, 5573.14], [3, 5.47, 18849.23]],
            [[145, 4.273, 6283.076], [7, 3.92, 12566.15]],
            [[4, 2.56, 6283.08]]
        ];
        const r_subcount = [40, 10, 6, 2, 1];
        const sum = [];
        for (let i = 0; i < 5; i++) {
            sum[i] = this.earth_periodic_term_summation(R_TERMS[i], r_subcount[i], jme);
        }
        return this.earth_values(sum, 5, jme);
    }

    xy_term_summation(i, x) {
        const Y_TERMS = [[0, 0, 0, 0, 1], [-2, 0, 0, 2, 2], [0, 0, 0, 2, 2], [0, 0, 0, 0, 2], [0, 1, 0, 0, 0], [0, 0, 1, 0, 0], [-2, 1, 0, 2, 2], [0, 0, 0, 2, 1], [0, 0, 1, 2, 2], [-2, -1, 0, 2, 2], [-2, 0, 1, 0, 0], [-2, 0, 0, 2, 1], [0, 0, -1, 2, 2], [2, 0, 0, 0, 0], [0, 0, 1, 0, 1], [2, 0, -1, 2, 2], [0, 0, -1, 0, 1], [0, 0, 1, 2, 1], [-2, 0, 2, 0, 0], [0, 0, -2, 2, 1], [2, 0, 0, 2, 2], [0, 0, 2, 2, 2], [0, 0, 2, 0, 0], [-2, 0, 1, 2, 2], [0, 0, 0, 2, 0], [-2, 0, 0, 2, 0], [0, 0, -1, 2, 1], [0, 2, 0, 0, 0], [2, 0, -1, 0, 1], [-2, 2, 0, 2, 2], [0, 1, 0, 0, 1], [-2, 0, 1, 0, 1], [0, -1, 0, 0, 1], [0, 0, 2, -2, 0], [2, 0, -1, 2, 1], [2, 0, 1, 2, 2], [0, 1, 0, 2, 2], [-2, 1, 1, 0, 0], [0, -1, 0, 2, 2], [2, 0, 0, 2, 1], [2, 0, 1, 0, 0], [-2, 0, 2, 2, 2], [-2, 0, 1, 2, 1], [2, 0, -2, 0, 1], [2, 0, 0, 0, 1], [0, -1, 1, 0, 0], [-2, -1, 0, 2, 1], [-2, 0, 0, 0, 1], [0, 0, 2, 2, 1], [-2, 0, 2, 0, 1], [-2, 1, 0, 2, 1], [0, 0, 1, -2, 0], [-1, 0, 1, 0, 0], [-2, 1, 0, 0, 0], [1, 0, 0, 0, 0], [0, 0, 1, 2, 0], [0, 0, -2, 2, 2], [-1, -1, 1, 0, 0], [0, 1, 1, 0, 0], [0, -1, 1, 2, 2], [2, -1, -1, 2, 2], [0, 0, 3, 2, 2], [2, -1, 0, 2, 2]];
        let sum = 0;
        for (let j = 0; j < 5; j++) {
            sum += x[j] * Y_TERMS[i][j];
        }
        return sum;
    }

    nutation_longitude_and_obliquity(jce, x) {
        const PE_TERMS = [[-171996, -174.2, 92025, 8.9], [-13187, -1.6, 5736, -3.1], [-2274, -0.2, 977, -0.5], [2062, 0.2, -895, 0.5], [1426, -3.4, 54, -0.1], [712, 0.1, -7, 0], [-517, 1.2, 224, -0.6], [-386, -0.4, 200, 0], [-301, 0, 129, -0.1], [217, -0.5, -95, 0.3], [-158, 0, 0, 0], [129, 0.1, -70, 0], [123, 0, -53, 0], [63, 0, 0, 0], [63, 0.1, -33, 0], [-59, 0, 26, 0], [-58, -0.1, 32, 0], [-51, 0, 27, 0], [48, 0, 0, 0], [46, 0, -24, 0], [-38, 0, 16, 0], [-31, 0, 13, 0], [29, 0, 0, 0], [29, 0, -12, 0], [26, 0, 0, 0], [-22, 0, 0, 0], [21, 0, -10, 0], [17, -0.1, 0, 0], [16, 0, -8, 0], [-16, 0.1, 7, 0], [-15, 0, 9, 0], [-13, 0, 7, 0], [-12, 0, 6, 0], [11, 0, 0, 0], [-10, 0, 5, 0], [-8, 0, 3, 0], [7, 0, -3, 0], [-7, 0, 0, 0], [-7, 0, 3, 0], [-7, 0, 3, 0], [6, 0, 0, 0], [6, 0, -3, 0], [6, 0, -3, 0], [-6, 0, 3, 0], [-6, 0, 3, 0], [5, 0, 0, 0], [-5, 0, 3, 0], [-5, 0, 3, 0], [-5, 0, 3, 0], [4, 0, 0, 0], [4, 0, 0, 0], [4, 0, 0, 0], [-4, 0, 0, 0], [-4, 0, 0, 0], [-4, 0, 0, 0], [3, 0, 0, 0], [-3, 0, 0, 0], [-3, 0, 0, 0], [-3, 0, 0, 0], [-3, 0, 0, 0], [-3, 0, 0, 0], [-3, 0, 0, 0], [-3, 0, 0, 0]];
        let sum_psi = 0, sum_epsilon = 0;
        for (let i = 0; i < 63; i++) {
            const xy_term_sum = this.deg2rad(this.xy_term_summation(i, x));
            sum_psi += (PE_TERMS[i][0] + jce * PE_TERMS[i][1]) * Math.sin(xy_term_sum);
            sum_epsilon += (PE_TERMS[i][2] + jce * PE_TERMS[i][3]) * Math.cos(xy_term_sum);
        }
        return {
            del_psi: sum_psi / 36000000.0,
            del_epsilon: sum_epsilon / 36000000.0
        };
    }

    ecliptic_mean_obliquity(jme) {
        const u = jme / 10.0;
        return 84381.448 + u * (-4680.93 + u * (-1.55 + u * (1999.25 + u * (-51.38 + u * (-249.67 +
            u * (-39.05 + u * (7.12 + u * (27.87 + u * (5.79 + u * 2.45)))))))));
    }

    ecliptic_true_obliquity(delta_epsilon, epsilon0) {
        return delta_epsilon + epsilon0 / 3600.0;
    }

    aberration_correction(r) {
        return -20.4898 / (3600.0 * r);
    }

    apparent_sun_longitude(theta, delta_psi, delta_tau) {
        return theta + delta_psi + delta_tau;
    }

    greenwich_mean_sidereal_time(jd, jc) {
        return this.limit_degrees(280.46061837 + 360.98564736629 * (jd - 2451545.0) +
            jc * jc * (0.000387933 - jc / 38710000.0));
    }

    greenwich_sidereal_time(nu0, delta_psi, epsilon) {
        return nu0 + delta_psi * Math.cos(this.deg2rad(epsilon));
    }

    sun_equatorial_horizontal_parallax(r) {
        return 8.794 / (3600.0 * r);
    }

    right_ascension_parallax_and_topocentric_dec(latitude, elevation, xi, h, delta) {
        const lat_rad = this.deg2rad(latitude);
        const xi_rad = this.deg2rad(xi);
        const h_rad = this.deg2rad(h);
        const delta_rad = this.deg2rad(delta);
        const u = Math.atan(0.99664719 * Math.tan(lat_rad));
        const y = 0.99664719 * Math.sin(u) + elevation * Math.sin(lat_rad) / 6378140.0;
        const x = Math.cos(u) + elevation * Math.cos(lat_rad) / 6378140.0;
        const delta_alpha_rad = Math.atan2(-x * Math.sin(xi_rad) * Math.sin(h_rad),
            Math.cos(delta_rad) - x * Math.sin(xi_rad) * Math.cos(h_rad));
        const delta_prime = this.rad2deg(Math.atan2((Math.sin(delta_rad) - y * Math.sin(xi_rad)) * Math.cos(delta_alpha_rad),
            Math.cos(delta_rad) - x * Math.sin(xi_rad) * Math.cos(h_rad)));
        return { delta_alpha: this.rad2deg(delta_alpha_rad), delta_prime: delta_prime };
    }

    sun_mean_longitude(jme) {
        return this.limit_degrees(280.4664567 + jme * (360007.6982779 + jme * (0.03032028 +
            jme * (1 / 49931.0 + jme * (-1 / 15300.0 + jme * (-1 / 2000000.0))))));
    }

    eot(m, alpha, del_psi, epsilon) {
        return this.limit_minutes(4.0 * (m - 0.0057183 - alpha + del_psi * Math.cos(this.deg2rad(epsilon))));
    }

    limit_minutes(minutes) {
        let limited = minutes;
        if (limited < -20.0) limited += 1440.0;
        else if (limited > 20.0) limited -= 1440.0;
        return limited;
    }

    approx_sun_transit_time(alpha_zero, longitude, nu) {
        return (alpha_zero - longitude - nu) / 360.0;
    }

    sun_hour_angle_at_rise_set(latitude, delta_zero, h0_prime) {
        let h0 = -99999;
        const latitude_rad = this.deg2rad(latitude);
        const delta_zero_rad = this.deg2rad(delta_zero);
        const argument = (Math.sin(this.deg2rad(h0_prime)) - Math.sin(latitude_rad) * Math.sin(delta_zero_rad)) /
            (Math.cos(latitude_rad) * Math.cos(delta_zero_rad));
        if (Math.abs(argument) <= 1) h0 = this.limit_degrees180(this.rad2deg(Math.acos(argument)));
        return h0;
    }

    limit_degrees180(degrees) {
        let limited = degrees / 180.0;
        limited = 180.0 * (limited - Math.floor(limited));
        if (limited < 0) limited += 180.0;
        return limited;
    }

    limit_degrees180pm(degrees) {
        let limited = degrees / 360.0;
        limited = 360.0 * (limited - Math.floor(limited));
        if (limited < -180.0) limited += 360.0;
        else if (limited > 180.0) limited -= 360.0;
        return limited;
    }

    approx_sun_rise_and_set(m_transit, h0) {
        const h0_dfrac = h0 / 360.0;
        return {
            sunrise: this.limit_zero2one(m_transit - h0_dfrac),
            sunset: this.limit_zero2one(m_transit + h0_dfrac),
            suntransit: this.limit_zero2one(m_transit)
        };
    }

    limit_zero2one(value) {
        let limited = value - Math.floor(value);
        if (limited < 0) limited += 1.0;
        return limited;
    }

    rts_alpha_delta_prime(ad, n) {
        let a = ad[1] - ad[0];
        let b = ad[2] - ad[1];
        if (Math.abs(a) >= 2.0) a = this.limit_zero2one(a);
        if (Math.abs(b) >= 2.0) b = this.limit_zero2one(b);
        return ad[1] + n * (a + b + (b - a) * n) / 2.0;
    }

    rts_sun_altitude(latitude, delta_prime, h_prime) {
        const latitude_rad = this.deg2rad(latitude);
        const delta_prime_rad = this.deg2rad(delta_prime);
        return this.rad2deg(Math.asin(Math.sin(latitude_rad) * Math.sin(delta_prime_rad) +
            Math.cos(latitude_rad) * Math.cos(delta_prime_rad) * Math.cos(this.deg2rad(h_prime))));
    }

    sun_rise_and_set(m_rts, h_rts, delta_prime, latitude, h_prime, h0_prime, sun) {
        return m_rts[sun] + (h_rts[sun] - h0_prime) /
            (360.0 * Math.cos(this.deg2rad(delta_prime[sun])) * Math.cos(this.deg2rad(latitude)) * Math.sin(this.deg2rad(h_prime[sun])));
    }

    dayfrac_to_local_hr(dayfrac, timezone) {
        return 24.0 * this.limit_zero2one(dayfrac + timezone / 24.0);
    }
}