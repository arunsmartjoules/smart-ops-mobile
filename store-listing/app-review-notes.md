# App Review Information — JouleOps (iOS)

Paste into App Store Connect › App Review Information › Notes, and as the reply to the
Guideline 2.1 "Information Needed" message. Fill every `[[...]]` before sending.

---

Hello App Review team,

Thank you for the review. Please find the requested information below.

**1. Screen recording**
Attached: [[file name / link]] — recorded on [[device model]], iOS [[version]]. It starts
at app launch and shows: account registration (sign-up request), sign-in with email and
password, Sign in with Apple, the main workflows (tickets, site logs, preventive maintenance,
attendance), and account deletion (Profile › Delete Account).

**2. Purpose and audience**
JouleOps is the field-operations app of Smart Joules Pvt. Ltd., an HVAC energy-efficiency
company that operates and maintains chiller plants and air-conditioning systems at client
facilities (hospitals, commercial buildings) in India. The app is used by Smart Joules site
technicians and their managers.

It replaces paper logbooks and spreadsheets: technicians record daily equipment readings
(chiller, water quality, temperature/humidity, chemical dosing), carry out preventive
maintenance checklists with photos, raise and resolve complaint tickets and incidents, and
mark attendance at their assigned site. The app works offline, since plant rooms often have
no signal, and syncs when the device reconnects. Managers see site status and approve work.

**3. How to access the app**
The app requires an account because all data belongs to specific sites and teams.
Demo account (pre-approved, assigned to a demo site with sample data):

- Email: [[demo email]]
- Password: [[demo password]]

Steps: launch the app → Sign In → enter the credentials above. The Home tab shows the
day's tasks. Tickets, Site Logs, PM and Incidents are in the bottom tabs; attendance and
settings are under Profile.

Notes:
- New sign-ups are reviewed by a Smart Joules administrator before the account is activated,
  so a freshly created account cannot sign in straight away. Please use the demo account above.
- Attendance punch-in normally requires the device to be at the assigned work site. The demo
  account is configured [[as remote / without the site geofence]] so punch-in works anywhere.
- Account deletion: Profile › Delete Account. It is confirmed twice and takes effect
  immediately; the user is signed out and can no longer sign in. Please do not delete the
  demo account itself; a second account for testing deletion is available:
  [[second email]] / [[second password]].

**4. External services**
- Amazon Web Services (India/US regions): hosts the JouleOps API, the PostgreSQL database
  and file storage for photos and signatures (Amazon S3).
- Sign in with Apple and Google Sign-In: optional sign-in methods alongside email and password.
- Expo (EAS): delivers push notifications (Expo Push Service, via APNs) and over-the-air
  bug-fix updates to the app's JavaScript bundle.
- Device services: location (attendance at work site), camera and photo library (photos on
  tickets, logs and checklists; QR scanning of equipment tags).

The app has no advertising, no third-party analytics or tracking SDKs, no in-app purchases
and no paid content. It uses no AI services.

**5. Regional differences**
The app works the same in every region. It is used mainly in India, where Smart Joules
operates, but no features or content change by region.

**6. Regulated industry / third-party material**
Not applicable. The app records building-equipment maintenance data. It is not a medical,
financial, gambling or other regulated service, and it contains no licensed third-party
content.

Privacy policy: [[privacy policy URL]]
Support contact: [[name, email, phone]]

Regards,
[[name]], Smart Joules Pvt. Ltd.
