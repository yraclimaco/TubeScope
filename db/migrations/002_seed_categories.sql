-- Assignable US video categories (videoCategories.list). The live ingest upserts any
-- category the API returns, so this list only needs to cover the historical data.
INSERT INTO core.category (category_id, name) VALUES
    (1, 'Film & Animation'),
    (2, 'Autos & Vehicles'),
    (10, 'Music'),
    (15, 'Pets & Animals'),
    (17, 'Sports'),
    (18, 'Short Movies'),
    (19, 'Travel & Events'),
    (20, 'Gaming'),
    (21, 'Videoblogging'),
    (22, 'People & Blogs'),
    (23, 'Comedy'),
    (24, 'Entertainment'),
    (25, 'News & Politics'),
    (26, 'Howto & Style'),
    (27, 'Education'),
    (28, 'Science & Technology'),
    (29, 'Nonprofits & Activism')
ON CONFLICT (category_id) DO UPDATE SET name = EXCLUDED.name;
