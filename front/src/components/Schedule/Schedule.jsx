import { useEffect, useRef, useState } from 'react';
import { NavigateNext, NavigateBefore } from '@mui/icons-material';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import { dateAdd, dateMinus, ASSET_PREFIX } from '../../environment';


import './Schedule.scss';

const LOGO_BASE_PATH = `${ASSET_PREFIX ? ASSET_PREFIX : ''}/img/teams`;
const buildLogoSrc = (team) => `${LOGO_BASE_PATH}/${team}.svg`;

function TeamLogo({ team }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    setIsLoaded(false);
  }, [team]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete && img.naturalWidth > 0) {
      setIsLoaded(true);
    }
  }, [team]);

  if (!team) return null;

  return (
    <div className={`teamLogoWrapper${!isLoaded ? ' isPending' : ''}`}>
      <img
        ref={imgRef}
        height="16"
        width="16"
        draggable={false}
        loading="lazy"
        className='teamLogo'
        src={buildLogoSrc(team)}
        alt={team}
        onLoad={() => setIsLoaded(true)}
        onError={() => setIsLoaded(false)}
      />
    </div>
  );
}

export default function Schedule({ games, date, changeDate, changeGame, isLoading, selectedGameId }) {

  const scrollRef = useRef(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startScrollLeft = useRef(0);
  const dragMoved = useRef(false);
  const handleGameClick = (id) => {
    if (dragMoved.current) return; // suppress click if user dragged
    changeGame(id);
  }

  const gamesList = (games || []).map(g => {
    const isUpcoming = g.status.endsWith('ET');
    const isSelected = g.id === selectedGameId;
    const gameClassName = `game${isSelected ? ' selected' : ''}`;

    if (!isUpcoming) {
      return (
        <div className={gameClassName} key={g.id} onClick={() => handleGameClick(g.id)}>
          <div className='iconRow'>
            <TeamLogo team={g.awayteam} />
            {g.awayteam} - {g.hometeam}
            <TeamLogo team={g.hometeam} />
          </div>
          <div>{g.awayscore} - {g.homescore}</div>
          <div>{g.status}</div>
        </div>
      )
    } else {
      return (
        <div className={gameClassName} key={g.id} onClick={() => handleGameClick(g.id)}>
          <div className='iconRow'>
            <TeamLogo team={g.awayteam} />
            {g.awayteam} - {g.hometeam}
            <TeamLogo team={g.hometeam} />
          </div>
          <div className='recordRow'>
            {/* <span>{g.awayrecord}</span>
            <span>{g.homerecord}</span> */}
          </div>
          <div>{g.status}</div>
        </div>
      )
    }

  });
  const scrollScheduleRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft += 100;
    }
  }
  const scrollScheduleLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft -= 100;
    }
  }

  const dateDown = () => {
    const downdate = new Date(date);
    downdate.setDate(downdate.getDate() - dateMinus);
    let month = downdate.getMonth() + 1;
    if (month < 10) {
      month = '0' + month;
    }
    let day = downdate.getDate();
    if (day < 10) {
      day = '0' + day;
    }
    let val = `${downdate.getFullYear()}-${month}-${day}`
    changeDate({ target: { value: val }});
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
    }
  }
  const dateUp = () => {
    const update = new Date(date);
    update.setDate(update.getDate() + dateAdd);
    let month = update.getMonth() + 1;
    if (month < 10) {
      month = '0' + month;
    }
    let day = update.getDate();
    if (day < 10) {
      day = '0' + day;
    }
    let val = `${update.getFullYear()}-${month}-${day}`
    changeDate({ target: { value: val }})
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
    }
  }

  const onMouseDown = (e) => {
    if (!scrollRef.current) return;
    isDragging.current = true;
    dragMoved.current = false;
    startX.current = e.pageX - scrollRef.current.offsetLeft;
    startScrollLeft.current = scrollRef.current.scrollLeft;
    scrollRef.current.classList.add('dragging');
  };
  const onMouseLeave = () => {
    if (!scrollRef.current) return;
    isDragging.current = false;
    scrollRef.current.classList.remove('dragging');
  };
  const onMouseUp = () => {
    if (!scrollRef.current) return;
    isDragging.current = false;
    scrollRef.current.classList.remove('dragging');
  };
  const onMouseMove = (e) => {
    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = x - startX.current;
    if (Math.abs(walk) > 3) dragMoved.current = true;
    scrollRef.current.scrollLeft = startScrollLeft.current - walk;
  };

  const onTouchStart = (e) => {
    if (!scrollRef.current) return;
    isDragging.current = true;
    dragMoved.current = false;
    const touch = e.touches[0];
    startX.current = touch.pageX - scrollRef.current.offsetLeft;
    startScrollLeft.current = scrollRef.current.scrollLeft;
    scrollRef.current.classList.add('dragging');
  };
  const onTouchEnd = () => {
    if (!scrollRef.current) return;
    isDragging.current = false;
    scrollRef.current.classList.remove('dragging');
  };
  const onTouchMove = (e) => {
    if (!isDragging.current || !scrollRef.current) return;
    if (e.cancelable) {
       e.preventDefault();
    }
    const touch = e.touches[0];
    const x = touch.pageX - scrollRef.current.offsetLeft;
    const walk = x - startX.current;
    if (Math.abs(walk) > 3) dragMoved.current = true;
    scrollRef.current.scrollLeft = startScrollLeft.current - walk;
  };

  return (
    <div className='schedule'>
      <div className='scheduleContent'>
        <div className='datePick'>
          <label className='visuallyHidden' htmlFor='scheduleDate'>Select game date</label>
          <IconButton className='scheduleButton' onClick={dateDown} aria-label='Previous date'>
            <NavigateBefore />
          </IconButton>
          <input
            id='scheduleDate'
            className='dateInput'
            type="date"
            value={date}
            onChange={(e) => changeDate(e)}
          />
          <IconButton className='scheduleButton' onClick={dateUp} aria-label='Next date'>
            <NavigateNext />
          </IconButton>
        </div>
        <div className='gamePick'>
          <IconButton className='scheduleButton' onClick={scrollScheduleLeft} aria-label='Scroll games left'>
            <NavigateBefore />
          </IconButton>
          {isLoading ? (
            <div className='loadingIndicator'>
              <CircularProgress size={24} thickness={5} />
              <span>Loading games...</span>
            </div>
          ) : gamesList.length ? (
            <div
              className='games'
              ref={scrollRef}
              onMouseDown={onMouseDown}
              onMouseLeave={onMouseLeave}
              onMouseUp={onMouseUp}
              onMouseMove={onMouseMove}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
              onTouchMove={onTouchMove}
            >
              {gamesList}
            </div>
          ) : (
            <div className='noGames'>No Games Scheduled</div>
          )}
          <IconButton className='scheduleButton end' onClick={scrollScheduleRight} aria-label='Scroll games right'>
            <NavigateNext />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
