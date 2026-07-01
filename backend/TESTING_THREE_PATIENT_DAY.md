# Three-Patient Day Testing

This workflow verifies schedule completion, travel address chaining, Google
Routes distance, fare calculation, and claim aggregation without physically
travelling.

## 1. Deterministic Backend Test

The automated test uses a temporary in-memory database and fixed route
distances. It does not call Google or modify `travel_allowance.db`.

```powershell
cd D:\travel-allowance-app\backend
python -m unittest tests.test_three_patient_day -v
```

Expected calculations:

| Leg | Distance | Rate | Fare |
| --- | ---: | ---: | ---: |
| Workday start to Patient 1 | 4.25 KM | 8.00 | 34.00 |
| Patient 1 to Patient 2 | 3.50 KM | 8.00 | 28.00 |
| Patient 2 to Patient 3 | 5.75 KM | 8.00 | 46.00 |

The resulting claim must contain 13.50 KM, travel total 108.00, daily
allowance 150.00, and grand total 258.00.

## 2. Real Google Maps Smoke Test

The smoke script uses a temporary SQLite database, real JWT authentication,
four Google Geocoding requests, and three Google Routes requests. The
temporary database is removed when the command finishes.

Use complete postal addresses:

```powershell
cd D:\travel-allowance-app\backend
python scripts/simulate_therapist_day.py `
  --start-address "Vidhana Soudha, Dr Ambedkar Veedhi, Bengaluru, Karnataka 560001" `
  --patient-address "Bangalore Palace, Vasanth Nagar, Bengaluru, Karnataka 560052" `
  --patient-address "ISKCON Temple Bangalore, Hare Krishna Hill, Rajajinagar, Bengaluru, Karnataka 560010" `
  --patient-address "Lalbagh Botanical Garden, Mavalli, Bengaluru, Karnataka 560004"
```

The command exits unsuccessfully if:

- An address cannot be geocoded.
- A travel leg does not start at the previous destination.
- Google does not return a positive road distance.
- `travel_fare` differs from `round(total_km * per_km_rate, 2)`.
- Claim totals differ from the three linked travel entries.

The Google API key is read from the backend environment and is never printed.

## 3. Android Emulator GPS Test

### Start the backend

```powershell
cd D:\travel-allowance-app\backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

For Android Emulator testing, set this development value:

```dotenv
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000
```

`10.0.2.2` is the Android Emulator alias for the development computer.
Restart Metro after changing the environment.

### Start the development build

From `mobile`:

```powershell
npx expo run:android
npm run start -- --port 8081
```

Use a development build rather than Expo Go because remote notifications and
other native features are not fully available in Expo Go.

### Simulate the therapist route

1. Create three schedules from the admin application using complete addresses.
2. Read each schedule's `patient_latitude` and `patient_longitude` from
   Swagger or `GET /schedule/{schedule_id}`.
3. Open Android Studio's emulator controls using the three-dot button.
4. Open **Location**, enter the workday start latitude and longitude, and
   select **Set location**.
5. Open the mobile app and start the workday.
6. Before completing Patient 1, set the emulator to a point more than 250
   metres away. Adding `0.01` to the latitude is approximately 1.1 KM.
7. Attempt completion and confirm it is rejected and Today's Travel remains
   empty.
8. Set the emulator to Patient 1's exact stored coordinates and complete the
   treatment.
9. Repeat with the exact coordinates for Patients 2 and 3.
10. Confirm Today's Travel contains exactly three entries and that each entry
    starts from the previous destination.
11. Submit today's claim and compare its totals with the smoke-test report.

## Calculation Rules

For vehicle travel:

```text
travel_fare = round(total_km * per_km_rate, 2)
claim_total_km = round(sum(travel total_km), 2)
claim_travel_total = round(sum(travel travel_fare), 2)
grand_total = round(claim_travel_total + daily_allowance, 2)
```

The backend remains authoritative for the 250-metre geofence. Emulator
coordinates simulate device GPS but do not bypass arrival validation.
