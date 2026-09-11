//! One-time import of the legacy `MNA_Management_System_EDITABLE.xlsx` workbook.
//!
//! Only parsing lives here — the frontend previews the rows and does the inserts
//! through the normal DB layer, so all dedupe/validation rules stay in one place.

use std::io::{Read, Seek};

use calamine::{open_workbook_auto_from_rs, Data, Reader};
use serde::Serialize;

#[derive(Serialize, Default, Debug, PartialEq)]
pub struct ImportedStudent {
    pub admission_no: Option<String>,
    pub full_name: String,
    pub gender: Option<String>,
    pub dob: Option<String>,
    pub address: Option<String>,
    pub contact: Option<String>,
    pub guardian: Option<String>,
    pub emergency_contact: Option<String>,
    pub date_admitted: Option<String>,
    pub class_name: Option<String>,
    pub status: Option<String>,
    pub notes: Option<String>,
}

#[tauri::command]
pub fn parse_students_xlsx(path: String) -> Result<Vec<ImportedStudent>, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Could not read the file: {e}"))?;
    parse_students_reader(std::io::Cursor::new(bytes))
}

pub fn parse_students_reader<R: Read + Seek + Clone>(
    reader: R,
) -> Result<Vec<ImportedStudent>, String> {
    let mut wb = open_workbook_auto_from_rs(reader)
        .map_err(|e| format!("This does not look like a valid Excel file: {e}"))?;
    let range = wb
        .worksheet_range("STUDENTS")
        .map_err(|_| "The workbook has no sheet named \"STUDENTS\".".to_string())?;

    let rows: Vec<&[Data]> = range.rows().collect();
    let header_idx = rows
        .iter()
        .position(|r| r.iter().any(|c| cell_str(Some(c)).eq_ignore_ascii_case("Full Name")))
        .ok_or("Could not find the student table header row.")?;

    // Column order in the legacy sheet.
    let mut out = Vec::new();
    for row in rows.iter().skip(header_idx + 1) {
        let full_name = cell_str(row.get(2));
        if full_name.is_empty() {
            continue;
        }
        out.push(ImportedStudent {
            admission_no: opt(cell_str(row.get(1))),
            full_name,
            gender: normalize_gender(cell_str(row.get(4))),
            dob: cell_date(row.get(5)),
            address: opt(cell_str(row.get(6))),
            contact: opt(cell_str(row.get(7))),
            guardian: opt(cell_str(row.get(8))),
            emergency_contact: opt(cell_str(row.get(9))),
            date_admitted: cell_date(row.get(10)),
            class_name: opt(cell_str(row.get(11))),
            status: opt(cell_str(row.get(12))),
            notes: opt(cell_str(row.get(14))),
        });
    }
    Ok(out)
}

fn cell_str(c: Option<&Data>) -> String {
    match c {
        Some(Data::String(s)) => s.trim().to_string(),
        Some(Data::Int(i)) => i.to_string(),
        Some(Data::Float(f)) => {
            if f.fract() == 0.0 {
                format!("{}", *f as i64)
            } else {
                f.to_string()
            }
        }
        Some(Data::Bool(b)) => b.to_string(),
        Some(Data::DateTime(dt)) => dt
            .as_datetime()
            .map(|d| d.format("%Y-%m-%d").to_string())
            .unwrap_or_default(),
        _ => String::new(),
    }
}

fn opt(s: String) -> Option<String> {
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

fn normalize_gender(s: String) -> Option<String> {
    match s.trim().to_lowercase().as_str() {
        "male" | "m" => Some("Male".to_string()),
        "female" | "f" => Some("Female".to_string()),
        _ => None,
    }
}

fn cell_date(c: Option<&Data>) -> Option<String> {
    match c {
        Some(Data::DateTime(dt)) => dt.as_datetime().map(|d| d.format("%Y-%m-%d").to_string()),
        Some(Data::Float(f)) => excel_serial_to_iso(*f),
        Some(Data::Int(i)) => excel_serial_to_iso(*i as f64),
        Some(Data::String(s)) if !s.trim().is_empty() => Some(s.trim().to_string()),
        _ => None,
    }
}

fn excel_serial_to_iso(serial: f64) -> Option<String> {
    if serial <= 0.0 {
        return None;
    }
    let base = chrono::NaiveDate::from_ymd_opt(1899, 12, 30)?;
    base.checked_add_signed(chrono::Duration::days(serial.trunc() as i64))
        .map(|d| d.format("%Y-%m-%d").to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const WORKBOOK: &[u8] = include_bytes!("../../reference/MNA_Management_System_EDITABLE.xlsx");

    #[test]
    fn parses_all_forty_two_sample_students() {
        let students = parse_students_reader(std::io::Cursor::new(WORKBOOK)).unwrap();
        assert_eq!(students.len(), 42);
    }

    #[test]
    fn maps_the_first_row_correctly() {
        let students = parse_students_reader(std::io::Cursor::new(WORKBOOK)).unwrap();
        let first = &students[0];
        assert_eq!(first.full_name, "Mariam Abdul Wasiu");
        // admission numbers follow the "MNA<n>" pattern in the sample sheet
        let adm = first.admission_no.as_deref().unwrap_or_default();
        assert!(
            adm.chars().take(3).all(|c| c.is_ascii_alphabetic())
                && adm[3..].chars().all(|c| c.is_ascii_digit()),
            "unexpected admission number format: {adm:?}"
        );
        assert_eq!(first.gender.as_deref(), Some("Female"));
        assert_eq!(first.dob.as_deref(), Some("2011-03-18"));
        assert_eq!(first.class_name.as_deref(), Some("Class 5"));
        assert_eq!(first.status.as_deref(), Some("Active"));
    }

    #[test]
    fn every_student_has_a_name_and_most_have_a_class() {
        let students = parse_students_reader(std::io::Cursor::new(WORKBOOK)).unwrap();
        assert!(students.iter().all(|s| !s.full_name.trim().is_empty()));
        let with_class = students.iter().filter(|s| s.class_name.is_some()).count();
        assert!(with_class >= 40, "expected most rows to carry a class, got {with_class}");
    }

    #[test]
    fn contact_numbers_come_through_as_plain_strings() {
        let students = parse_students_reader(std::io::Cursor::new(WORKBOOK)).unwrap();
        let with_contact = students.iter().filter(|s| s.contact.is_some()).count();
        assert!(with_contact > 30);
        assert!(students
            .iter()
            .filter_map(|s| s.contact.as_deref())
            .all(|c| !c.contains('.') && !c.contains('e')));
    }
}
