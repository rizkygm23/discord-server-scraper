
### Frontend Usage: Role Promotion Tracking

New columns have been added to track weekly role progression.

- **`role_kamis`**: Snapshot of the highest Magnitude role on Thursday.
- **`role_sabtu`**: Snapshot of the highest Magnitude role on Saturday.
- **`is_promoted`**: Automatically calculated flag. `TRUE` means the user upgraded their role between Thursday and Saturday of the current week.

#### Example: Fetch Promoted Users
Use this query to display a list of users who got promoted this week.

```sql
SELECT 
  username, 
  display_name, 
  avatar_url,
  role_kamis as previous_rank,
  role_sabtu as new_rank,
  (role_sabtu - role_kamis) as rank_increase
FROM seismic_dc_user
WHERE is_promoted = TRUE
ORDER BY rank_increase DESC;
```

#### Example display in UI:
> **RizkyGM**
> 📈 Promoted! (Mag 1.0 → Mag 3.0)
