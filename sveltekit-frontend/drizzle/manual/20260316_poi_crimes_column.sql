-- Add free-text crimes and charges to persons of interest.
ALTER TABLE persons_of_interest ADD COLUMN IF NOT EXISTS crimes text[];-- Add crimes text array column to persons_of_interest
ALTER TABLE persons_of_interest ADD COLUMN IF NOT EXISTS crimes text[];
