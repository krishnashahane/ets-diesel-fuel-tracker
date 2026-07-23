# Diesel Management System — Written Flowchart

START

1. Open Diesel Management System

2. User reaches Login Screen

3. User enters login ID and password

4. System authenticates credentials

5. System checks user role

   IF role = User:
   5.1 Open only Diesel Input Form
   5.2 Hide Dashboard completely
   5.3 Load master dropdown data from database:
   - Punching Date
   - Cost Center
   - Pump
   - Vehicle Number
   5.4 User fills the form
   5.5 User uploads required photos:
   - Vehicle Number Plate Photo
   - Diesel Filling Slip / Challan / Bill Photo
   - Diesel Filled Meter Photo
   - Vehicle Odometer Photo
   5.6 User clicks Submit
   5.7 System validates all fields and files
   5.8 If validation fails, show errors and stop submission
   5.9 If validation passes:
   - save submission record
   - store uploaded images
   - create unique entry ID
   - send images to OCR engine
   - extract text and numbers from images
   - map extracted data into structured fields
   - verify the extracted data against selected vehicle/date/pump/cost center
   - detect missing, duplicate, blurry, or mismatched data
   - assign OCR confidence and validation status
   - save final structured record in database
   - append or regenerate Excel output automatically
   - refresh admin dashboards automatically
   - show success message to the user
   5.10 User can only submit new entries or log out

   IF role = Admin:
   5.11 Open Dashboard
   5.12 Allow access to all submitted records
   5.13 Show live dashboard, filters, search, reports, and OCR status
   5.14 Allow viewing of uploaded images and extracted data
   5.15 Allow Excel export and data review
   5.16 Allow monitoring of all user submissions
   5.17 Admin cannot access super-admin-only system controls

   IF role = Super Admin:
   5.18 Open Dashboard plus system control panel
   5.19 Allow everything Admin can do
   5.20 Allow creation, editing, disabling, and resetting of user accounts
   5.21 Allow management of master data:
   - Vehicle master
   - Cost center master
   - Pump master
   5.22 Allow OCR configuration and system settings
   5.23 Allow backup, restore, audit logs, and security logs
   5.24 Allow complete monitoring and control of the full system

6. On the first setup, system seeds master data:

   * Vehicle list from imported workbook
   * Cost center list from imported workbook
   * Pump list from admin-defined master table
   * 15 regular user accounts
   * 1 admin account
   * 1 super admin account

7. Every valid submission becomes one structured record with columns such as:

   * Entry ID
   * Punching Date
   * Cost Center
   * Pump
   * Vehicle Number
   * Bill Number
   * Bill Date
   * Bill Time
   * Diesel Quantity
   * Amount
   * Meter Reading
   * Odometer Reading
   * OCR Confidence
   * Validation Status
   * Submitted By
   * Submission Time
   * Image Links

8. Database remains the source of truth

9. Excel sheet is generated or refreshed automatically from the database

10. Admin and Super Admin see the updated records immediately

11. User never sees the dashboard

12. Logout ends the session

END

# System Rules

* User = input form only
* Admin = dashboard + records + export
* Super Admin = full control
* Excel must be auto-generated from validated records
* OCR must run after upload
* No manual typing by admin for submitted records
* All photos must remain linked to the record
* Invalid, duplicate, or unreadable entries must be flagged for review

Location Tracking
On every successful login, request the user's permission to access their location using the browser's Geolocation API.
If permission is granted:
Capture Latitude
Capture Longitude
Capture Accuracy (meters)
Capture Timestamp
Attach the location to:
Login event
Every diesel entry submission
Any important admin or super admin action (such as exports, edits, user management)
Store the location in the database and show it to Admin and Super Admin.
Display the location on an embedded map (e.g., OpenStreetMap) for convenience if desired.

Important: Browsers require the user to grant location permission. The app cannot obtain GPS coordinates if the user denies permission or if the device/browser cannot provide them. You should handle those cases gracefully by recording "Location permission denied" or "Location unavailable."

Additional database fields

For user activity and diesel entries, include:

Latitude
Longitude
Location Accuracy
Location Timestamp
Device Type
Browser
Operating System
Public IP (server-side, if desired)
User Agent
Admin Dashboard

Add:

Live location of each submission (coordinates and optional map view)
Submission history with locations
Filter by location, vehicle, date, cost center, and pump
Login history with coordinates
Activity history with coordinates
Super Admin Dashboard

Everything Admin has, plus:

User login history
Full audit trail
Location history for all significant actions
Export location data with reports.


1. Input Form

The input form should include the following dropdown fields:

Punching Date
Cost Center
Pump
Vehicle Number
2. Photo Upload Fields

The following image upload options should be available:

Vehicle Number Plate Photo
Diesel Filling Slip / Challan / Bill Photo
Diesel Filled Meter Photo
Vehicle Odometer Photo
3. User Roles & Access Control

Admin & Super Admin

Can access and view the Dashboard.
Can view all submitted records.
Can manage and monitor the complete system.
User

Should only have access to the Input Form.
Should be able to submit the required details and upload the required photos.
The Dashboard should not be visible to users.
4. Dashboard Visibility

Dashboard access should be restricted to Admin and Super Admin only.
Regular Users should only see the data entry (input) page.