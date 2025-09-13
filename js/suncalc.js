class sunCalc {
	constructor(date = new Date(), latitude = 0, longitude = 0) {
		this.PI = 3.1415926535897932384626433832795028841971;
		this.SUN_RADIUS = 0.26667;
		this.data = {
			year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds(), delta_ut1: 0, delta_t: 0, timezone: 0, longitude: longitude, latitude: latitude, elevation: 0, pressure: 0, temperature: 0, slope: 0, azm_rotation: 0, atmos_refract: 0, jd: 0, jc: 0, jde: 0, jce: 0, jme: 0, l: 0, b: 0, r: 0, theta: 0, beta: 0, x0: 0, x1: 0, x2: 0, x3: 0, x4: 0, del_psi: 0, del_epsilon: 0, epsilon0: 0, epsilon: 0, del_tau: 0, lamda: 0, nu0: 0, nu: 0, alpha: 0, delta: 0, h: 0, xi: 0, del_alpha: 0, delta_prime: 0, alpha_prime: 0, h_prime: 0, e0: 0, del_e: 0, e: 0, eot: 0, srha: 0, ssha: 0, sta: 0, zenith: 0, azimuth_astro: 0, azimuth: 0, incidence: 0, suntransit: 0, sunrise: 0, sunset: 0
		};
	}

	rad2deg(radians) { return (180 / this.PI) * radians; }
	deg2rad(degrees) { return (this.PI / 180) * degrees; }

	limit_degrees(degrees) {
		let limited = degrees % 360;
		if (limited < 0) limited += 360;
		return limited;
	}

	julian_day(year, month, day, hour, minute, second, dut1, tz) {
		let day_decimal = day + (hour - tz + (minute + (second + dut1) / 60) / 60) / 24;
		if (month < 3) {
			month += 12;
			year--;
		}
		let julian_day = Math.trunc(365.25 * (year + 4716)) + Math.trunc(30.6001 * (month + 1)) + day_decimal - 1524.5;
		if (julian_day > 2299160) {
			let a = Math.trunc(year / 100);
			julian_day += (2 - a + Math.trunc(a / 4));
		}
		return julian_day;
	}

	julian_century(jd) { return (jd - 2451545) / 36525; }
	julian_ephemeris_day(jd, delta_t) { return jd + delta_t / 86400; }
	julian_ephemeris_century(jde) { return (jde - 2451545) / 36525; }
	julian_ephemeris_millennium(jce) { return jce / 10; }
	geocentric_longitude(l) { return this.limit_degrees(l + 180); }
	geocentric_latitude(b) { return -b; }

	mean_elongation_moon_sun(jce) { return this.third_order_polynomial(1 / 189474, -0.0019142, 445267.11148, 297.85036, jce); }
	mean_anomaly_sun(jce) { return this.third_order_polynomial(-1 / 300000, -0.0001603, 35999.05034, 357.52772, jce); }
	mean_anomaly_moon(jce) { return this.third_order_polynomial(1 / 56250, 0.0086972, 477198.867398, 134.96298, jce); }
	argument_latitude_moon(jce) { return this.third_order_polynomial(1 / 327270, -0.0036825, 483202.017538, 93.27191, jce); }
	ascending_longitude_moon(jce) { return this.third_order_polynomial(1 / 450000, 0.0020708, -1934.136261, 125.04452, jce); }
	third_order_polynomial(a, b, c, d, x) { return ((a * x + b) * x + c) * x + d; }

	geocentric_right_ascension(lamda, epsilon, beta) {
		const lamda_rad = this.deg2rad(lamda);
		const epsilon_rad = this.deg2rad(epsilon);
		return this.limit_degrees(this.rad2deg(Math.atan2(Math.sin(lamda_rad) * Math.cos(epsilon_rad) - Math.tan(this.deg2rad(beta)) * Math.sin(epsilon_rad), Math.cos(lamda_rad))));
	}

	geocentric_declination(beta, epsilon, lamda) {
		const beta_rad = this.deg2rad(beta);
		const epsilon_rad = this.deg2rad(epsilon);
		return this.rad2deg(Math.asin(Math.sin(beta_rad) * Math.cos(epsilon_rad) + Math.cos(beta_rad) * Math.sin(epsilon_rad) * Math.sin(this.deg2rad(lamda))));
	}

	observer_hour_angle(nu, longitude, alpha_deg) { return this.limit_degrees(nu + longitude - alpha_deg); }
	topocentric_right_ascension(alpha_deg, delta_alpha) { return alpha_deg + delta_alpha; }
	topocentric_local_hour_angle(h, delta_alpha) { return h - delta_alpha; }

	topocentric_elevation_angle(latitude, delta_prime, h_prime) {
		const lat_rad = this.deg2rad(latitude);
		const delta_prime_rad = this.deg2rad(delta_prime);
		return this.rad2deg(Math.asin(Math.sin(lat_rad) * Math.sin(delta_prime_rad) + Math.cos(lat_rad) * Math.cos(delta_prime_rad) * Math.cos(this.deg2rad(h_prime))));
	}

	atmospheric_refraction_correction(pressure, temperature, atmos_refract, e0) {
		let del_e = 0;
		if (e0 >= -1 * (this.SUN_RADIUS + atmos_refract)) {
			del_e = (pressure / 1010) * (283 / (273 + temperature)) * 1.02 / (60 * Math.tan(this.deg2rad(e0 + 10.3 / (e0 + 5.11))));
		}
		return del_e;
	}

	topocentric_elevation_angle_corrected(e0, delta_e) { return e0 + delta_e; }
	topocentric_zenith_angle(e) { return 90 - e; }

	topocentric_azimuth_angle_astro(h_prime, latitude, delta_prime) {
		const h_prime_rad = this.deg2rad(h_prime);
		const lat_rad = this.deg2rad(latitude);
		return this.limit_degrees(this.rad2deg(Math.atan2(Math.sin(h_prime_rad), Math.cos(h_prime_rad) * Math.sin(lat_rad) - Math.tan(this.deg2rad(delta_prime)) * Math.cos(lat_rad))));
	}

	topocentric_azimuth_angle(azimuth_astro) { return this.limit_degrees(azimuth_astro + 180); }

	surface_incidence_angle(zenith, azimuth_astro, azm_rotation, slope) {
		const zenith_rad = this.deg2rad(zenith);
		const slope_rad = this.deg2rad(slope);
		return this.rad2deg(Math.acos(Math.cos(zenith_rad) * Math.cos(slope_rad) + Math.sin(slope_rad) * Math.sin(zenith_rad) * Math.cos(this.deg2rad(azimuth_astro - azm_rotation))));
	}

	calculate() {
		if (this.validate_inputs(this.data)) return;
		this.data.jd = this.julian_day(this.data.year, this.data.month, this.data.day, this.data.hour, this.data.minute, this.data.second, this.data.delta_ut1, this.data.timezone);
		this.calculate_geocentric_sun_right_ascension_and_declination(this.data);
		this.data.h = this.observer_hour_angle(this.data.nu, this.data.longitude, this.data.alpha);
		this.data.xi = this.sun_equatorial_horizontal_parallax(this.data.r);
		const parallax = this.right_ascension_parallax_and_topocentric_dec(this.data.latitude, this.data.elevation, this.data.xi, this.data.h, this.data.delta);
		this.data.del_alpha = parallax.delta_alpha;
		this.data.delta_prime = parallax.delta_prime;
		this.data.alpha_prime = this.topocentric_right_ascension(this.data.alpha, this.data.del_alpha);
		this.data.h_prime = this.topocentric_local_hour_angle(this.data.h, this.data.del_alpha);
		this.data.e0 = this.topocentric_elevation_angle(this.data.latitude, this.data.delta_prime, this.data.h_prime);
		this.data.del_e = this.atmospheric_refraction_correction(this.data.pressure, this.data.temperature, this.data.atmos_refract, this.data.e0);
		this.data.e = this.topocentric_elevation_angle_corrected(this.data.e0, this.data.del_e);
		this.data.zenith = this.topocentric_zenith_angle(this.data.e);
		this.data.azimuth_astro = this.topocentric_azimuth_angle_astro(this.data.h_prime, this.data.latitude, this.data.delta_prime);
		this.data.azimuth = this.topocentric_azimuth_angle(this.data.azimuth_astro);
		this.data.incidence = this.surface_incidence_angle(this.data.zenith, this.data.azimuth_astro, this.data.azm_rotation, this.data.slope);
		this.calculate_eot_and_sun_rise_transit_set(this.data);
	}

	validate_inputs(data) {
		if (data.year < -2000 || data.year > 6000) return false;
		if (data.month < 1 || data.month > 12) return false;
		if (data.day < 1 || data.day > 31) return false;
		if (data.hour < 0 || data.hour > 24) return false;
		if (data.minute < 0 || data.minute > 59) return false;
		if (data.second < 0 || data.second >= 60) return false;
		if (data.pressure < 0 || data.pressure > 5000) return false;
		if (data.temperature <= -273 || data.temperature > 6000) return false;
		if (data.delta_ut1 <= -1 || data.delta_ut1 >= 1) return false;
		if (data.hour === 24 && (data.minute > 0 || data.second > 0)) return false;
		if (Math.abs(data.delta_t) > 8000) return false;
		if (Math.abs(data.timezone) > 18) return false;
		if (Math.abs(data.longitude) > 180) return false;
		if (Math.abs(data.latitude) > 90) return false;
		if (Math.abs(data.atmos_refract) > 5) return false;
		if (data.elevation < -6500000) return false;
		if (Math.abs(data.slope) > 360 || Math.abs(data.azm_rotation) > 360) return false;
		return true;
	}

	calculate_geocentric_sun_right_ascension_and_declination(data) {
		const x = new Array(5);
		data.jc = this.julian_century(data.jd);
		data.jde = this.julian_ephemeris_day(data.jd, data.delta_t);
		data.jce = this.julian_ephemeris_century(data.jde);
		data.jme = this.julian_ephemeris_millennium(data.jce);
		data.l = this.earth_heliocentric_longitude(data.jme);
		data.b = this.earth_heliocentric_latitude(data.jme);
		data.r = this.earth_radius_vector(data.jme);
		data.theta = this.geocentric_longitude(data.l);
		data.beta = this.geocentric_latitude(data.b);
		x[0] = data.x0 = this.mean_elongation_moon_sun(data.jce);
		x[1] = data.x1 = this.mean_anomaly_sun(data.jce);
		x[2] = data.x2 = this.mean_anomaly_moon(data.jce);
		x[3] = data.x3 = this.argument_latitude_moon(data.jce);
		x[4] = data.x4 = this.ascending_longitude_moon(data.jce);
		const nutation = this.nutation_longitude_and_obliquity(data.jce, x);
		data.del_psi = nutation.del_psi;
		data.del_epsilon = nutation.del_epsilon;
		data.epsilon0 = this.ecliptic_mean_obliquity(data.jme);
		data.epsilon = this.ecliptic_true_obliquity(data.del_epsilon, data.epsilon0);
		data.del_tau = this.aberration_correction(data.r);
		data.lamda = this.apparent_sun_longitude(data.theta, data.del_psi, data.del_tau);
		data.nu0 = this.greenwich_mean_sidereal_time(data.jd, data.jc);
		data.nu = this.greenwich_sidereal_time(data.nu0, data.del_psi, data.epsilon);
		data.alpha = this.geocentric_right_ascension(data.lamda, data.epsilon, data.beta);
		data.delta = this.geocentric_declination(data.beta, data.epsilon, data.lamda);
	}

	calculate_eot_and_sun_rise_transit_set(data) {
		const sun_rts = { ...data };
		let m = this.sun_mean_longitude(data.jme);
		data.eot = this.eot(m, data.alpha, data.del_psi, data.epsilon);
		sun_rts.hour = sun_rts.minute = sun_rts.second = sun_rts.delta_ut1 = sun_rts.timezone = 0;
		sun_rts.jd = this.julian_day(sun_rts.year, sun_rts.month, sun_rts.day, sun_rts.hour, sun_rts.minute, sun_rts.second, sun_rts.delta_ut1, sun_rts.timezone);
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
		m_rts[0] = this.approx_sun_transit_time(alpha[1], data.longitude, nu);
		const h0_prime = -1 * (this.SUN_RADIUS + data.atmos_refract);
		let h0 = this.sun_hour_angle_at_rise_set(data.latitude, delta[1], h0_prime);
		if (h0 >= 0) {
			const rts_results = this.approx_sun_rise_and_set(m_rts[0], h0);
			m_rts[1] = rts_results.sunrise;
			m_rts[2] = rts_results.sunset;
			m_rts[0] = rts_results.suntransit;
			const nu_rts = [], h_rts = [], alpha_prime = [], delta_prime = [], h_prime = [];
			for (let i = 0; i < 3; i++) {
				nu_rts[i] = nu + 360.985647 * m_rts[i];
				let n = m_rts[i] + data.delta_t / 86400;
				alpha_prime[i] = this.rts_alpha_delta_prime(alpha, n);
				delta_prime[i] = this.rts_alpha_delta_prime(delta, n);
				h_prime[i] = this.limit_degrees180pm(nu_rts[i] + data.longitude - alpha_prime[i]);
				h_rts[i] = this.rts_sun_altitude(data.latitude, delta_prime[i], h_prime[i]);
			}
			data.srha = h_prime[1];
			data.ssha = h_prime[2];
			data.sta = h_rts[0];
			data.suntransit = this.dayfrac_to_local_hr(m_rts[0] - h_prime[0] / 360, data.timezone);
			data.sunrise = this.dayfrac_to_local_hr(this.sun_rise_and_set(m_rts, h_rts, delta_prime, data.latitude, h_prime, h0_prime, 1), data.timezone);
			data.sunset = this.dayfrac_to_local_hr(this.sun_rise_and_set(m_rts, h_rts, delta_prime, data.latitude, h_prime, h0_prime, 2), data.timezone);
		} else {
			data.srha = data.ssha = data.sta = data.suntransit = data.sunrise = data.sunset = -99999;
		}
	}

	earth_periodic_term_summation(terms, jme) { return terms.reduce((sum, term) => sum + term[0] * Math.cos(term[1] + term[2] * jme), 0); }
	earth_values(term_sum, jme) { return term_sum.reduce((sum, val, i) => sum + val * Math.pow(jme, i), 0) / 1e8; }

	earth_heliocentric_longitude(jme) {
		const L_TERMS = [
			[[175347046, 0, 0], [3341656, 4.6692568, 6283.07585], [34894, 4.6261, 12566.1517]],
			[[628331966747, 0, 0], [206059, 2.678235, 6283.07585]],
			[[52919, 0, 0], [8720, 1.0721, 6283.0758]],
			[[289, 5.844, 6283.076]],
			[[114, 3.142, 0]],
			[[1, 3.14, 0]]
		];
		const sum = L_TERMS.map(terms => this.earth_periodic_term_summation(terms, jme));
		return this.limit_degrees(this.rad2deg(this.earth_values(sum, jme)));
	}

	earth_heliocentric_latitude(jme) {
		const B_TERMS = [
			[[280, 3.199, 84334.662], [102, 5.422, 5507.553]],
			[[9, 3.9, 5507.55]]
		];
		const sum = B_TERMS.map(terms => this.earth_periodic_term_summation(terms, jme));
		return this.rad2deg(this.earth_values(sum, jme));
	}

	earth_radius_vector(jme) {
		const R_TERMS = [
			[[100013989, 0, 0], [1670700, 3.0984635, 6283.07585]],
			[[103019, 1.10749, 6283.07585]],
			[[4359, 5.7846, 6283.0758]],
			[[145, 4.273, 6283.076]],
			[[4, 2.56, 6283.08]]
		];
		const sum = R_TERMS.map(terms => this.earth_periodic_term_summation(terms, jme));
		return this.earth_values(sum, jme);
	}

	xy_term_summation(i, x) {
		const Y_TERMS = [[0, 0, 0, 0, 1], [-2, 0, 0, 2, 2], [0, 0, 0, 2, 2]];
		return Y_TERMS[i].reduce((sum, term, j) => sum + x[j] * term, 0);
	}

	nutation_longitude_and_obliquity(jce, x) {
		const PE_TERMS = [
			[-171996, -174.2, 92025, 8.9],
			[-13187, -1.6, 5736, -3.1],
			[-2274, -0.2, 977, -0.5]
		];
		let sum_psi = 0, sum_epsilon = 0;
		PE_TERMS.forEach((term, i) => {
			const xy_term_sum = this.deg2rad(this.xy_term_summation(i, x));
			sum_psi += (term[0] + jce * term[1]) * Math.sin(xy_term_sum);
			sum_epsilon += (term[2] + jce * term[3]) * Math.cos(xy_term_sum);
		});
		return { del_psi: sum_psi / 36000000, del_epsilon: sum_epsilon / 36000000 };
	}

	ecliptic_mean_obliquity(jme) {
		const u = jme / 10;
		return 84381.448 + u * (-4680.93 + u * (-1.55 + u * (1999.25 + u * (-51.38))));
	}

	ecliptic_true_obliquity(delta_epsilon, epsilon0) { return delta_epsilon + epsilon0 / 3600; }
	aberration_correction(r) { return -20.4898 / (3600 * r); }
	apparent_sun_longitude(theta, delta_psi, delta_tau) { return theta + delta_psi + delta_tau; }
	greenwich_mean_sidereal_time(jd, jc) { return this.limit_degrees(280.46061837 + 360.98564736629 * (jd - 2451545) + jc * jc * (0.000387933 - jc / 38710000)); }
	greenwich_sidereal_time(nu0, delta_psi, epsilon) { return nu0 + delta_psi * Math.cos(this.deg2rad(epsilon)); }
	sun_equatorial_horizontal_parallax(r) { return 8.794 / (3600 * r); }

	right_ascension_parallax_and_topocentric_dec(latitude, elevation, xi, h, delta) {
		const lat_rad = this.deg2rad(latitude), xi_rad = this.deg2rad(xi), h_rad = this.deg2rad(h), delta_rad = this.deg2rad(delta);
		const u = Math.atan(0.99664719 * Math.tan(lat_rad));
		const y = 0.99664719 * Math.sin(u) + elevation * Math.sin(lat_rad) / 6378140;
		const x = Math.cos(u) + elevation * Math.cos(lat_rad) / 6378140;
		const delta_alpha_rad = Math.atan2(-x * Math.sin(xi_rad) * Math.sin(h_rad), Math.cos(delta_rad) - x * Math.sin(xi_rad) * Math.cos(h_rad));
		const delta_prime = this.rad2deg(Math.atan2((Math.sin(delta_rad) - y * Math.sin(xi_rad)) * Math.cos(delta_alpha_rad), Math.cos(delta_rad) - x * Math.sin(xi_rad) * Math.cos(h_rad)));
		return { delta_alpha: this.rad2deg(delta_alpha_rad), delta_prime: delta_prime };
	}

	sun_mean_longitude(jme) { return this.limit_degrees(280.4664567 + jme * (360007.6982779 + jme * (0.03032028))); }
	eot(m, alpha, del_psi, epsilon) { return this.limit_minutes(4 * (m - 0.0057183 - alpha + del_psi * Math.cos(this.deg2rad(epsilon)))); }

	limit_minutes(minutes) {
		let limited = minutes;
		if (limited < -20) limited += 1440;
		else if (limited > 20) limited -= 1440;
		return limited;
	}

	approx_sun_transit_time(alpha_zero, longitude, nu) { return (alpha_zero - longitude - nu) / 360; }

	sun_hour_angle_at_rise_set(latitude, delta_zero, h0_prime) {
		let h0 = -99999;
		const argument = (Math.sin(this.deg2rad(h0_prime)) - Math.sin(this.deg2rad(latitude)) * Math.sin(this.deg2rad(delta_zero))) / (Math.cos(this.deg2rad(latitude)) * Math.cos(this.deg2rad(delta_zero)));
		if (Math.abs(argument) <= 1) {
			h0 = this.limit_degrees180(this.rad2deg(Math.acos(argument)));
		}
		return h0;
	}

	limit_degrees180(degrees) {
		let limited = degrees % 180;
		if (limited < 0) limited += 180;
		return limited;
	}

	limit_degrees180pm(degrees) {
		let limited = degrees % 360;
		if (limited < -180) limited += 360;
		else if (limited > 180) limited -= 360;
		return limited;
	}

	approx_sun_rise_and_set(m_transit, h0) {
		const h0_dfrac = h0 / 360;
		return {
			sunrise: this.limit_zero2one(m_transit - h0_dfrac),
			sunset: this.limit_zero2one(m_transit + h0_dfrac),
			suntransit: this.limit_zero2one(m_transit)
		};
	}

	limit_zero2one(value) {
		let limited = value - Math.floor(value);
		if (limited < 0) limited += 1;
		return limited;
	}

	rts_alpha_delta_prime(ad, n) {
		let a = ad[1] - ad[0], b = ad[2] - ad[1];
		if (Math.abs(a) >= 2) a = this.limit_zero2one(a);
		if (Math.abs(b) >= 2) b = this.limit_zero2one(b);
		return ad[1] + n * (a + b + (b - a) * n) / 2;
	}

	rts_sun_altitude(latitude, delta_prime, h_prime) { return this.rad2deg(Math.asin(Math.sin(this.deg2rad(latitude)) * Math.sin(this.deg2rad(delta_prime)) + Math.cos(this.deg2rad(latitude)) * Math.cos(this.deg2rad(delta_prime)) * Math.cos(this.deg2rad(h_prime)))); }
	sun_rise_and_set(m_rts, h_rts, delta_prime, latitude, h_prime, h0_prime, sun) { return m_rts[sun] + (h_rts[sun] - h0_prime) / (360 * Math.cos(this.deg2rad(delta_prime[sun])) * Math.cos(this.deg2rad(latitude)) * Math.sin(this.deg2rad(h_prime[sun]))); }
	dayfrac_to_local_hr(dayfrac, timezone) { return 24 * this.limit_zero2one(dayfrac + timezone / 24); }
}