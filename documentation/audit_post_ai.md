# Audit: Post-AI 30 Repos Dataset

**Dataset**: 30 randomly selected non-scottyUX repositories from analyses_rows.csv
**Total Analysis Rows**: 30 one per unique repository

## Summary Statistics

| Status | Count | Percentage |
|--------|-------|-----------|
| ✅ Complete | 6 | 20% |
| ⚠️ Incomplete | 23 | 77% |
| ❌ Not Found | 1 | 3% |

## Data Quality Analysis

| Field | Populated | Empty | Percentage |
|-------|-----------|-------|-----------|
| result_id | 30 | 0 | 100% |
| commit_sha | 29 | 1 | 97% |
| course_id | 6 | 24 | 20% |
| team_name | 6 | 24 | 20% |
| analysis_timestamp | 30 | 0 | 100% |

### Columns in post_ai_30.csv

- **owner**: GitHub username or organization
- **team_name**: Team name if analyzed as part of a group project (optional, often empty)
- **commit_sha**: Git commit hash analyzed
- **analysis_timestamp**: ISO 8601 timestamp of analysis execution
- **repo**: Repository name
- **course_id**: Associated course code (optional, often empty)
- **result_id**: Unique analysis identifier (format: owner-repo-commit)
- **repo_url**: Full GitHub repository URL

## Status Definitions

- **✅ Complete**: All required fields present, including optional metadata
- **⚠️ Incomplete**: Core fields present but missing optional metadata (course_id, team_name)
- **❌ Not Found**: Record exists but missing critical fields requiring re-analysis

## Notes

- **Source**: data/analyses_rows.csv (246,790 total rows from database)
- **Filtering**: Excluded 34 rows from 7 scottyUX repositories
- **Selection**: 30 unique non-scottyUX repositories, most recent analysis per repo
