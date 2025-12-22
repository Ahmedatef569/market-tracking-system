-- Add recipient_display column to messages table
-- This column stores a user-friendly display of recipients (individual name, line name, or "Company Users")

ALTER TABLE messages ADD COLUMN IF NOT EXISTS recipient_display TEXT;

-- Add comment to explain the column
COMMENT ON COLUMN messages.recipient_display IS 'User-friendly display of recipients: individual name for single recipient, line name for bulk line selection, or "Company Users" for mixed lines';

