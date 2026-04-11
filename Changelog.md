# Changelog

## [0.2.0] - 2026-04-11
### Added
- ✨ Automatic personal SWOT analysis after individual survey submission
- 📄 Personal SWOT report generation with metadata (ID, name, dept, answered date)
- 🔍 Scope filter in Admin answers tab (all/personal/org)
- ⬇️ Retroactive report download for past personal answers
- 📋 Personal report service utility (personalReport.ts)

### Changed
- Separated personal analysis flow from aggregated SWOT analysis
- Report file naming: `surveyName_ID_name_dept_yyyymmdd.html`

### Fixed
- Types export for Answer in Admin.tsx

## [0.1.5] - 2026-04-09
### Added
- Director role support with department selection
...