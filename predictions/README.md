# Pre-registered predictions

Each file is written **before** the events it covers and never edited afterwards; a new file is added instead. `2026-10-15.json` covers five real events at Climate Pledge Arena (MANÁ Oct 17, Kraken v Red Wings Oct 20, Kacey Musgraves Oct 26, Gorillaz Oct 31, Garth Brooks Nov 13), made with no Qloo signal. Its SHA-256 was posted in the project thread when it was written.

How to check: stand-level POS counts in 15-minute buckets from the venue or its concessionaire; failing that, queue lengths timed at two stands per window. Regenerate with `npx tsx lib/deep/cli/predict.mts <out> <event ids…>`.
