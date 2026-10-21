// SPDX-License-Identifier: GPL-2.0
// Subsurface's calculations, copied from github.com/subsurface/subsurface
// (commit 999783c, 19 October 2026) for core's differential tests. Each
// function keeps its source's statements and order; only the structs are
// flattened to the one open-circuit gas and one dive computer Shylog has.
//
// Copyright the Subsurface authors, under GPL-2.0 (see their LICENSE). This
// is a separate test program that Shylog runs over a pipe, never linked in.
//
// Reads one command per line on stdin and answers each with one line.

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#define SURFACE_THRESHOLD 750
#define O2_IN_AIR 209
#define SEAWATER_SALINITY 10300
#define FRESHWATER_SALINITY 10000

// core/units.h: 1_atm is round(1013.25) mbar.
static const int one_atm = 1013;
static int int_cast(double v) { return static_cast<int>(lrint(v)); }
static double bar_to_atm(double bar) { return bar / one_atm * 1000; }
static double mbar_to_atm(int mbar) { return (double)mbar / one_atm; }

// core/gas.h
static int get_o2(int o2) { return o2 ? o2 : O2_IN_AIR; }

// core/gas-model.cpp
static double virial_m1(const double coeff[], double x)
{
	return x*coeff[0] + x*x*coeff[1] + x*x*x*coeff[2];
}

static double gas_compressibility_factor(int o2_permille, double bar)
{
	static const double o2_coefficients[3] = {
		-7.18092073703e-04,
		+2.81852572808e-06,
		-1.50290620492e-09
	};
	static const double n2_coefficients[3] = {
		-2.19260353292e-04,
		+2.92844845532e-06,
		-2.07613482075e-09
	};
	static const double he_coefficients[3] = {
		+4.87320026468e-04,
		-8.83632921053e-08,
		+5.33304543646e-11
	};

	bar = std::clamp(bar, 0.0, 500.0);

	int o2 = get_o2(o2_permille);
	int he = 0;

	double Z = virial_m1(o2_coefficients, bar) * o2 +
		   virial_m1(he_coefficients, bar) * he +
		   virial_m1(n2_coefficients, bar) * (1000 - o2 - he);

	return Z * 0.001 + 1.0;
}

// core/equipment.cpp: cylinder_t::gas_volume
static int gas_volume(int size_mliter, int o2, int mbar)
{
	double bar = mbar / 1000.0;
	double z_factor = gas_compressibility_factor(o2, bar);
	return int_cast(size_mliter * bar_to_atm(bar) / z_factor);
}

// core/dive.cpp: the dive's water, as depth_to_mbarf and rel_mbar_to_depth
// read it. A surface pressure of 0 is unknown, as get_surface_pressure has it.
struct water {
	int salinity;
	int surface_mbar;
};

static double salinity_to_specific_weight(int salinity)
{
	return salinity * 0.981 / 100000.0;
}

static double calculate_depth_to_mbarf(int depth_mm, int surface_mbar, int salinity)
{
	if (!surface_mbar)
		surface_mbar = one_atm;
	if (!salinity)
		salinity = SEAWATER_SALINITY;
	if (salinity < 500)
		salinity += FRESHWATER_SALINITY;
	double specific_weight = salinity_to_specific_weight(salinity);
	return surface_mbar + depth_mm * specific_weight;
}

static int get_surface_pressure(const water &w)
{
	return w.surface_mbar > 0 ? w.surface_mbar : one_atm;
}

static int depth_to_mbar(const water &w, int depth_mm)
{
	return lrint(calculate_depth_to_mbarf(depth_mm, get_surface_pressure(w), w.salinity));
}

static double depth_to_bar(const water &w, int depth_mm)
{
	return depth_to_mbar(w, depth_mm) / 1000.0;
}

static double depth_to_atm(const water &w, int depth_mm)
{
	return mbar_to_atm(depth_to_mbar(w, depth_mm));
}

static int rel_mbar_to_depth(const water &w, int mbar)
{
	int salinity = w.salinity;
	if (!salinity)
		salinity = SEAWATER_SALINITY;

	/* whole mbar gives us cm precision */
	double specific_weight = salinity_to_specific_weight(salinity);
	return int_cast(mbar / specific_weight);
}

static int mbar_to_depth(const water &w, int mbar)
{
	return rel_mbar_to_depth(w, mbar - get_surface_pressure(w));
}

// core/dive.cpp: dive::gas_mod
static int gas_mod(const water &w, int o2, int po2_limit_mbar, int roundto_mm)
{
	double depth = (double) mbar_to_depth(w, po2_limit_mbar * 1000 / get_o2(o2));
	// Rounding should be towards lower=safer depths but we give a bit
	// of fudge to all to switch to o2 at 6m. So from .9 we round up.
	return (int)(depth / roundto_mm + 0.1) * roundto_mm;
}

struct sample {
	int time;
	int depth;
	int mkelvin;
};

// core/divecomputer.cpp: fixup_dc_duration, returning what it would set.
struct duration_fixup {
	int duration;
	int meandepth;
};

static duration_fixup fixup_dc_duration(int dc_duration, const std::vector<sample> &samples)
{
	int duration = 0;
	int lasttime = 0, lastdepth = 0, depthtime = 0;

	for (const auto &sample: samples) {
		int time = sample.time;
		int depth = sample.depth;

		/* Do we *have* a depth? */
		if (depth < 0)
			continue;

		/* We ignore segments at the surface */
		if (depth > SURFACE_THRESHOLD || lastdepth > SURFACE_THRESHOLD) {
			duration += time - lasttime;
			depthtime += (time - lasttime) * (depth + lastdepth) / 2;
		}
		lastdepth = depth;
		lasttime = time;
	}
	if (duration)
		return { duration, (depthtime + duration / 2) / duration };
	return { dc_duration, 0 };
}

// core/divecomputer.cpp
static int dc_totaltime(int dc_duration, const std::vector<sample> &samples)
{
	int time = dc_duration;

	for (auto it = samples.rbegin(); it != samples.rend(); ++it) {
		time = it->time;
		if (it->depth >= SURFACE_THRESHOLD)
			break;
	}
	return time;
}

// core/dive.cpp: dive::totaltime, for one logged dive computer.
static int totaltime(int duration, const std::vector<sample> &samples)
{
	int time = duration;

	int dc_time = dc_totaltime(duration, samples);
	if (dc_time > time)
		time = dc_time;
	return time;
}

// core/divelist.cpp: calculate_otu, open-circuit branch.
static int calculate_otu(const water &w, int o2, const std::vector<sample> &samples)
{
	double otu = 0.0;

	for (size_t i = 1; i < samples.size(); i++) {
		const sample &psample = samples[i - 1], &sample = samples[i];
		int po2i, po2f;
		double pm;
		int t = sample.time - psample.time;
		int depth = sample.depth;
		int pdepth = psample.depth;

		double amb_presure = depth_to_bar(w, depth);
		double pamb_pressure = depth_to_bar(w, pdepth);
		po2i = lrint(o2 * pamb_pressure);	// (initial) po2 at start of segment
		po2f = lrint(o2 * amb_presure);	// (final) po2 at end of segment

		if ((po2i > 500) || (po2f > 500)) {			// If PO2 in segment is above 500 mbar then calculate otu
			if (po2i <= 500) {				// For descent segment with po2i <= 500 mbar ..
				t = t * (po2f - 500) / (po2f - po2i);	// .. only consider part with PO2 > 500 mbar
				po2i = 501;				// Mostly important for the dive planner with long segments
			} else {
				if (po2f <= 500){
					t = t * (po2i - 500) / (po2i - po2f);	// For ascent segment with po2f <= 500 mbar ..
					po2f = 501;				// .. only consider part with PO2 > 500 mbar
				}
			}
			pm = (po2f + po2i)/1000.0 - 1.0;
			// This is a 3rd order continuous approximation of Baker's eq. 2, therefore Baker's eq. 1 is not used:
			otu += t / 60.0 * pow(pm, 5.0/6.0) * (1.0 - 5.0 * (po2f - po2i) * (po2f - po2i) / 216000000.0 / (pm * pm));
		}
	}
	return lrint(otu);
}

// core/divelist.cpp: calculate_cns_dive, open-circuit branch.
static double calculate_cns_dive(const water &w, int o2, const std::vector<sample> &samples)
{
	double cns = 0.0;
	double rate;

	/* Calculate the CNS for each sample in this dive and sum them */
	for (size_t i = 1; i < samples.size(); i++) {
		const sample &psample = samples[i - 1], &sample = samples[i];
		int t = sample.time - psample.time;
		int po2i, po2f = 0, po2;
		int depth = sample.depth;
		int pdepth = psample.depth;

		double amb_presure = depth_to_bar(w, depth);
		double pamb_pressure = depth_to_bar(w, pdepth);
		po2i = lrint(o2 * pamb_pressure);	// (initial) po2 at start of segment
		po2f = lrint(o2 * amb_presure);	// (final) po2 at end of segment
		po2 = (po2i + po2f) / 2;

		/* Don't increase CNS when po2 below 500 matm */
		if (po2 <= 500)
			continue;

		// This formula is the result of fitting two lines to the Log of the NOAA CNS table
		rate = po2 <= 1500 ? exp(-11.7853 + 0.00193873 * po2) : exp(-23.6349 + 0.00980829 * po2);
		cns += (double) t * rate * 100.0;
	}
	return cns;
}

// One entry of the dive table: its start, trip (0 for none), end as
// dive::endtime gives it, and its own CNS from calculate_cns_dive.
struct listed_dive {
	long long when;
	int trip;
	long long endtime;
	double cns;
};

// core/divelist.cpp: dive_table::calculate_cns, for the dive at `divenr`
// of a table sorted as Subsurface sorts it.
static int calculate_cns(const std::vector<listed_dive> &table, int divenr)
{
	double cns = 0.0;
	long long last_starttime, last_endtime = 0;
	const listed_dive &dive = table[divenr];

	int nr_dives = static_cast<int>(table.size());
	int i = divenr;
	/* Look at next dive in dive list table and correct i when needed */
	while (i < nr_dives - 1) {
		if (table[i].when > dive.when)
			break;
		i++;
	}
	/* Look at previous dive in dive list table and correct i when needed */
	while (i > 0) {
		if (table[i - 1].when < dive.when)
			break;
		i--;
	}
	last_starttime = dive.when;
	/* Walk backwards to check previous dives - how far do we need to go back? */
	while (i--) {
		if (i == divenr && i > 0)
			i--;
		const listed_dive &pdive = table[i];
		/* we don't want to mix dives from different trips as we keep looking
		 * for how far back we need to go */
		if (dive.trip && pdive.trip != dive.trip)
			continue;
		if (pdive.when >= dive.when || pdive.endtime + 12 * 60 * 60 < last_starttime)
			break;
		last_starttime = pdive.when;
	}
	/* Walk forward and add dives and surface intervals to CNS */
	while (++i < nr_dives) {
		const listed_dive &pdive = table[i];
		/* again skip dives from different trips */
		if (dive.trip && dive.trip != pdive.trip)
			continue;
		/* Don't add future dives */
		if (pdive.when >= dive.when)
			break;
		/* Don't add the copy of the dive itself */
		if (i == divenr)
			continue;

		/* CNS reduced with 90min halftime during surface interval */
		if (last_endtime)
			cns /= pow(2, (pdive.when - last_endtime) / (90.0 * 60.0));

		cns += pdive.cns;

		last_starttime = pdive.when;
		last_endtime = pdive.endtime;
	}

	/* CNS reduced with 90min halftime during surface interval */
	if (last_endtime)
		cns /= pow(2, (dive.when - last_endtime) / (90.0 * 60.0));

	cns += dive.cns;

	return lrint(cns);
}

// core/divelist.cpp: calculate_airuse and calculate_sac, one cylinder.
static int calculate_sac(const water &w, int size_mliter, int o2, int start_mbar, int end_mbar,
			 int duration, int meandepth_mm)
{
	double airuse, pressure, sac;
	int airuse_ml = 0;

	if (!end_mbar || start_mbar <= end_mbar)
		return 0;	// the cylinder is used, so no SAC
	airuse_ml += gas_volume(size_mliter, o2, start_mbar) - gas_volume(size_mliter, o2, end_mbar);
	airuse = airuse_ml / 1000.0;
	if (!airuse)
		return 0;

	if (!duration)
		return 0;

	if (!meandepth_mm)
		return 0;

	/* Mean pressure in ATM (SAC calculations are in atm*l/min) */
	pressure = depth_to_atm(w, meandepth_mm);
	sac = airuse / pressure * 60 / duration;

	/* milliliters per minute.. */
	return lrint(sac * 1000);
}

// core/divelist.cpp: dive_table::get_surface_interval, on (when, endtime)
// pairs in table order; -1 is no previous dive.
static long long get_surface_interval(const std::vector<listed_dive> &table, long long when)
{
	/* find previous dive. might want to use a binary search. */
	auto it = std::find_if(table.rbegin(), table.rend(),
			       [when] (auto &d) { return d.when < when; });
	if (it == table.rend())
		return -1;

	long long prev_end = it->endtime;
	if (prev_end > when)
		return 0;
	return when - prev_end;
}

// core/dive.cpp: similar and dive::likely_same, leaving out the manual-dive
// and same-computer checks, which Shylog has no data for.
static int similar(unsigned long a, unsigned long b, unsigned long expected)
{
	if (!a && !b)
		return 1;

	if (a && b) {
		unsigned long min, max, diff;

		min = a;
		max = b;
		if (a > b) {
			min = b;
			max = a;
		}
		diff = max - min;

		/* Smaller than expected difference? */
		if (diff < expected)
			return 1;
		/* Error less than 10% or the maximum */
		if (diff * 10 < max)
			return 1;
	}
	return 0;
}

struct comparable {
	int maxdepth, meandepth, duration;
	long long when;
};

static bool likely_same(const comparable &a, const comparable &b)
{
	if (!similar(a.maxdepth, b.maxdepth, 1000) ||
	    (a.meandepth && b.meandepth && !similar(a.meandepth, b.meandepth, 1000)) ||
	    !a.duration || !b.duration ||
	    !similar(a.duration, b.duration, 5 * 60))
		return false;

	int fuzz = std::max(a.duration, b.duration) / 2;
	fuzz = std::max(fuzz, 60);

	return (a.when <= b.when + fuzz) && (a.when >= b.when - fuzz);
}

// core/profile.cpp
enum velocity_t {
	STABLE,
	SLOW,
	MODERATE,
	FAST,
	CRAZY
};

static velocity_t velocity(int speed)
{
	velocity_t v;

	if (speed < -304) /* ascent faster than -60ft/min */
		v = CRAZY;
	else if (speed < -152) /* above -30ft/min */
		v = FAST;
	else if (speed < -76) /* -15ft/min */
		v = MODERATE;
	else if (speed < -25) /* -5ft/min */
		v = SLOW;
	else if (speed < 25) /* very hard to find data */
		v = STABLE;
	else if (speed < 152) /* between 5 and 30ft/min is considered slow */
		v = SLOW;
	else if (speed < 304) /* up to 60ft/min is moderate */
		v = MODERATE;
	else if (speed < 507) /* up to 100ft/min is fast */
		v = FAST;
	else /* more than that is just crazy - you'll blow your ears out */
		v = CRAZY;

	return v;
}

// core/interpolate.h
static int interpolate(int a, int b, int part, int whole)
{
	/* It is doubtful that we actually need floating point for this, but whatever */
	if (whole) {
		double x = (double)a * (whole - part) + (double)b * part;
		return (int)lrint(x / whole);
	}
	return (a+b)/2;
}

struct plot_data {
	int sec = 0;
	int depth = 0;
	int temperature = 0;
	int speed = 0;
	velocity_t velocity = STABLE;
};

static void insert_entry(std::vector<plot_data> &entry, int time, int depth)
{
	plot_data prev = entry.back();
	plot_data &e = entry.emplace_back(prev);
	e.sec = time;
	e.depth = depth;
}

// core/profile.cpp: calculate_max_limits_new, only its maxtime, for one
// computer outside the planner. Subsurface keeps events in time order.
static int calculate_maxtime(const std::vector<sample> &samples, std::vector<int> events)
{
	bool found_sample_beyond_last_event = false;
	int maxtime = 0;
	int lastdepth = 0;

	std::sort(events.begin(), events.end());
	/* Make sure we can fit all events */
	if (!events.empty())
		maxtime = std::max(maxtime, events.back());

	for (auto &s: samples) {
		int depth = s.depth;
		/* Make sure that we get the first sample beyond the last event.
		 * If maxtime is somewhere in the middle of the last segment,
		 * populate_plot_entries() gets confused leading to display artifacts. */
		if ((depth > SURFACE_THRESHOLD || lastdepth > SURFACE_THRESHOLD || !found_sample_beyond_last_event) &&
		    s.time > maxtime) {
			found_sample_beyond_last_event = true;
			maxtime = s.time;
		}
		lastdepth = depth;
	}
	return maxtime;
}

// core/profile.cpp: populate_plot_entries, the time and depth of each entry
// and the temperature carried, stopping one sample past maxtime.
static std::vector<plot_data> populate_plot_entries(const std::vector<sample> &samples, std::vector<int> events, int maxtime)
{
	std::vector<plot_data> entry(2);

	std::sort(events.begin(), events.end());
	int lastdepth = 0;
	int lasttime = 0;
	int lasttemp = 0;
	/* skip events at time = 0 */
	auto evit = events.begin();
	while (evit != events.end() && *evit == 0)
		++evit;
	for (const auto &sample: samples) {
		int time = sample.time;
		int offset, delta;

		/* Add intermediate plot entries if required */
		delta = time - lasttime;
		if (delta <= 0) {
			time = lasttime;
			delta = 1; // avoid divide by 0
		}
		for (offset = 10; offset < delta; offset += 10) {
			if (lasttime + offset > maxtime)
				break;

			/* Add events if they are between plot entries */
			while (evit != events.end() && *evit < lasttime + offset) {
				insert_entry(entry, *evit, interpolate(lastdepth, sample.depth, *evit - lasttime, delta));
				++evit;
			}

			/* now insert the time interpolated entry */
			insert_entry(entry, lasttime + offset, interpolate(lastdepth, sample.depth, offset, delta));

			/* skip events that happened at this time */
			while (evit != events.end() && *evit == lasttime + offset)
				++evit;
		}

		/* Add events if they are between plot entries */
		while (evit != events.end() && *evit < time) {
			insert_entry(entry, *evit, interpolate(lastdepth, sample.depth, *evit - lasttime, delta));
			++evit;
		}

		plot_data &e = entry.emplace_back();
		e.sec = time;
		e.depth = sample.depth;

		if (sample.mkelvin)
			e.temperature = lasttemp = sample.mkelvin;
		else
			e.temperature = lasttemp;
		/* skip events that happened at this time */
		while (evit != events.end() && *evit == time)
			++evit;
		lasttime = time;
		lastdepth = e.depth;

		if (time > maxtime)
			break;
	}

	/* Add any remaining events */
	while (evit != events.end()) {
		int time = *evit;

		if (time > lasttime) {
			insert_entry(entry, *evit, 0);
			lasttime = time;
		}
		++evit;
	}

	/* Add two final surface events */
	entry.emplace_back().sec = lasttime + 1;
	entry.emplace_back().sec = lasttime + 2;
	return entry;
}

// core/profile.cpp: analyze_plot_info, the speeds and bands.
static void analyze_plot_info(std::vector<plot_data> &entry)
{
	for (size_t i = 2; i < entry.size(); i++) {
		plot_data &e = entry[i];
		/* vertical velocity in mm/sec */
		/* Linus wants to smooth this - let's at least look at the samples that aren't FAST or CRAZY */
		if (entry[i].sec - entry[i-1].sec) {
			e.speed = (entry[i+0].depth - entry[i-1].depth) / (entry[i].sec - entry[i-1].sec);
			e.velocity = velocity(e.speed);
			/* if our samples are short and we aren't too FAST*/
			if (entry[i].sec - entry[i-1].sec < 15 && e.velocity < FAST) {
				int past = -2;
				while ((int)i + past > 0 && entry[i].sec - entry[i+past].sec < 15)
					past--;
				e.velocity = velocity((entry[i].depth - entry[i+past].depth) /
						      (entry[i].sec - entry[i+past].sec));
			}
		} else {
			e.velocity = STABLE;
			e.speed = 0;
		}
	}
}

static std::vector<sample> read_samples(std::istream &in)
{
	size_t n;
	in >> n;
	std::vector<sample> samples(n);
	for (auto &s: samples)
		in >> s.time >> s.depth >> s.mkelvin;
	return samples;
}

static std::vector<listed_dive> read_table(std::istream &in)
{
	size_t n;
	in >> n;
	std::vector<listed_dive> table(n);
	for (auto &d: table)
		in >> d.when >> d.trip >> d.endtime >> d.cns;
	return table;
}

int main()
{
	std::string line;
	while (std::getline(std::cin, line)) {
		std::istringstream in(line);
		std::string command;
		in >> command;
		if (command == "volume") {
			int size, o2, mbar;
			in >> size >> o2 >> mbar;
			printf("%d\n", gas_volume(size, o2, mbar));
		} else if (command == "sac") {
			water w;
			int size, o2, start, end, duration, meandepth;
			in >> w.salinity >> w.surface_mbar >> size >> o2 >> start >> end >> duration >> meandepth;
			printf("%d\n", calculate_sac(w, size, o2, start, end, duration, meandepth));
		} else if (command == "mod") {
			water w;
			int o2, limit;
			in >> w.salinity >> w.surface_mbar >> o2 >> limit;
			printf("%d\n", gas_mod(w, o2, limit, 100));
		} else if (command == "dive") {
			// The duration is the computer's, which fixup_dc_duration
			// replaces before dive::totaltime reads it.
			water w;
			int o2, duration;
			in >> w.salinity >> w.surface_mbar >> o2 >> duration;
			auto samples = read_samples(in);
			auto fixed = fixup_dc_duration(duration, samples);
			printf("%.17g %d %d %d %d\n", calculate_cns_dive(w, o2, samples),
			       calculate_otu(w, o2, samples), fixed.duration, fixed.meandepth,
			       totaltime(fixed.duration, samples));
		} else if (command == "cns") {
			int divenr;
			in >> divenr;
			auto table = read_table(in);
			printf("%d\n", calculate_cns(table, divenr));
		} else if (command == "interval") {
			long long when;
			in >> when;
			auto table = read_table(in);
			printf("%lld\n", get_surface_interval(table, when));
		} else if (command == "same") {
			comparable a, b;
			in >> a.maxdepth >> a.meandepth >> a.duration >> a.when;
			in >> b.maxdepth >> b.meandepth >> b.duration >> b.when;
			printf("%d\n", likely_same(a, b) ? 1 : 0);
		} else if (command == "plot") {
			auto samples = read_samples(in);
			size_t n;
			in >> n;
			std::vector<int> events(n);
			for (auto &t: events)
				in >> t;
			int maxtime = calculate_maxtime(samples, events);
			auto entry = populate_plot_entries(samples, events, maxtime);
			analyze_plot_info(entry);
			// Core starts at the second of the two leading surface entries.
			printf("%d %zu", maxtime, entry.size() - 1);
			for (size_t i = 1; i < entry.size(); i++)
				printf(" %d %d %d %d %d", entry[i].sec, entry[i].depth, entry[i].temperature,
				       entry[i].speed, entry[i].velocity);
			printf("\n");
		} else {
			printf("unknown %s\n", command.c_str());
		}
		fflush(stdout);
	}
}
